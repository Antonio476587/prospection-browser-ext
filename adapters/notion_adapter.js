'use strict';

/**
 * @class NotionAdapter
 * @classdesc Provides methods for interacting with the Notion API,
 * including authentication, data retrieval (schema, databases), and data submission.
 * This adapter is designed to be used within a browser extension environment.
 */
class NotionAdapter {
  /**
   * Initiates a connection to Notion by triggering an authentication flow.
   * This method communicates with the background script (service worker) of the extension
   * to perform the OAuth2 authentication process. User interaction (e.g., granting permissions)
   * may be required in a separate Notion tab/window.
   *
   * @param {object} [uiUtils] - Optional utility object for displaying messages to the user.
   * @param {function} [uiUtils.showMessage] - A function that takes a message string and a type string (e.g., 'success', 'error')
   *                                           to display feedback to the user.
   * @returns {Promise<boolean>} A promise that resolves to `true` if the authentication process
   *                             is successfully initiated or if already authenticated, and `false` if an error occurs
   *                             or the user denies access.
   * @sideeffect May trigger a new tab/window for Notion authentication if not already connected.
   *             Uses `chrome.runtime.sendMessage` to communicate with the background script.
   */
  async connect(uiUtils) {
    console.log('NotionAdapter.connect: Attempting to connect to Notion...');
    try {
      // Check if running in an environment with Chrome extension APIs.
      // This is important for testing or if the adapter might run in other contexts.
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        console.warn('NotionAdapter.connect: chrome.runtime.sendMessage is not available. Assuming non-extension environment or testing. Simulating success.');
        // In a non-extension context (e.g. unit tests) or for local development without a full background script setup,
        // this simulates a successful connection.
        if (uiUtils && typeof uiUtils.showMessage === 'function') {
          uiUtils.showMessage('Simulated Notion connection success (dev mode).', 'success');
        }
        return true; // Simulate success for testing or non-extension environments.
      }

      // Send a message to the background script to initiate the Notion OAuth flow.
      // The background script is responsible for handling the complexities of OAuth2.
      const response = await chrome.runtime.sendMessage({ type: "MSG_INITIATE_NOTION_AUTH" });

      if (response && response.success) {
        console.log('NotionAdapter.connect: Notion authentication successful/initiated.');
        if (uiUtils && typeof uiUtils.showMessage === 'function') {
          uiUtils.showMessage('Notion authentication successful!', 'success');
        }
        return true;
      } else {
        const errorMessage = response && response.error ? response.error : 'Unknown error during authentication initiation.';
        console.error('NotionAdapter.connect: Notion authentication failed or was denied:', errorMessage);
        if (uiUtils && typeof uiUtils.showMessage === 'function') {
          uiUtils.showMessage(`Notion authentication failed: ${errorMessage}`, 'error');
        }
        return false;
      }
    } catch (error) {
      console.error('NotionAdapter.connect: Error sending message to background script or during Notion connect:', error);
      if (uiUtils && typeof uiUtils.showMessage === 'function') {
        const displayError = error && error.message ? error.message : String(error);
        uiUtils.showMessage(`Error connecting to Notion: ${displayError}`, 'error');
      }
      return false;
    }
  }

  /**
   * Sends data to a specified Notion database by creating a new page.
   * It transforms the input `data` object into Notion's expected property format
   * based on the provided `template.fieldMappings`.
   *
   * @param {object} data - A flat key-value object containing the data to be sent (e.g., a row from a CSV).
   *                        Keys should correspond to `sourceFieldName` in `fieldMappings`.
   * @param {object} template - The template configuration object.
   * @param {Array<object>} template.fieldMappings - An array of objects defining how fields from `data`
   *                                                 map to Notion database properties. Each object should have:
   *                                                 `sourceFieldName` (string): The key in the `data` object.
   *                                                 `targetFieldId` (string): The Notion property ID or name (depending on Notion API version and context, typically name for creation).
   *                                                 `targetFieldNotionType` (string): The Notion property type (e.g., 'title', 'rich_text', 'number', 'date', 'select', 'multi_select', 'files', 'checkbox', 'url', 'email', 'phone_number').
   * @param {object} connectionDetails - Object containing authentication and target database information.
   * @param {string} connectionDetails.accessToken - The Notion API access token.
   * @param {string} connectionDetails.targetDatabaseId - The ID of the Notion database where the page will be created.
   * @returns {Promise<object>} An `ExportResult` object.
   *                            On success: `{ success: true, pageUrl: string, pageId: string, message: string }`.
   *                            On failure: `{ success: false, error: string, details?: object, message: string }`.
   * @example
   * // For a 'title' property:
   * // notionProperties['PageTitle'] = { title: [{ text: { content: 'My Page Title' } }] };
   * // For a 'number' property:
   * // notionProperties['NumericField'] = { number: 123 };
   * // For a 'date' property:
   * // notionProperties['EventDate'] = { date: { start: '2023-01-01T00:00:00.000Z' } };
   */
  async sendData(data, template, connectionDetails) {
    // Validate essential connection details
    if (!connectionDetails || !connectionDetails.accessToken || !connectionDetails.targetDatabaseId) {
      console.error('NotionAdapter.sendData: Missing accessToken or targetDatabaseId in connectionDetails.');
      return { success: false, error: 'Configuration error: Missing accessToken or targetDatabaseId in connectionDetails.', message: 'Connection details are incomplete.' };
    }
    const { accessToken, targetDatabaseId } = connectionDetails;

    // Validate input data and template structure
    if (typeof data !== 'object' || data === null || typeof template !== 'object' || template === null) {
      console.error('NotionAdapter.sendData: Invalid data or template object provided.');
      return { success: false, error: 'Invalid data or template object.', message: 'Data or template is malformed.' };
    }
    if (!Array.isArray(template.fieldMappings)) {
      console.error('NotionAdapter.sendData: template.fieldMappings is not an array.');
      return { success: false, error: 'Template error: fieldMappings must be an array.', message: 'Template configuration is invalid.' };
    }

    const notionProperties = {}; // This object will hold the structured properties for the Notion API call.

    // Iterate over field mappings to transform data into Notion's property format.
    for (const mapping of template.fieldMappings) {
      if (!mapping || !mapping.sourceFieldName || !mapping.targetFieldId || !mapping.targetFieldNotionType) {
        console.warn('NotionAdapter.sendData: Skipping invalid mapping item due to missing fields:', mapping);
        continue;
      }

      const { sourceFieldName, targetFieldId, targetFieldNotionType } = mapping;
      let value = data[sourceFieldName];

      // If the source data doesn't have the field, or its value is null/undefined,
      // Notion generally expects the property to be omitted from the API request
      // rather than sending an explicit null (unless clearing a specific field type that supports it).
      // Skipping ensures we don't send empty/invalid values for types that require content.
      if (value === null || value === undefined) {
        console.log(`NotionAdapter.sendData: Value for source field "${sourceFieldName}" is null or undefined. Skipping Notion property "${targetFieldId}".`);
        continue;
      }

      // Construct the Notion property object based on its type.
      // Each case formats the 'value' according to Notion API requirements for that property type.
      // The 'targetFieldId' is used as the key in the notionProperties object,
      // which corresponds to the name of the property in the Notion database.
      switch (targetFieldNotionType) {
        case 'title':
          // Structure for a title property: { title: [{ text: { content: "Actual Title" } }] }
          notionProperties[targetFieldId] = { title: [{ text: { content: String(value) } }] };
          break;
        case 'rich_text':
          // Structure for a rich_text property: { rich_text: [{ text: { content: "Some text content" } }] }
          notionProperties[targetFieldId] = { rich_text: [{ text: { content: String(value) } }] };
          break;
        case 'number':
          // Structure for a number property: { number: 123.45 }
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            notionProperties[targetFieldId] = { number: numValue };
          } else {
            console.warn(`NotionAdapter.sendData: Value "${value}" for number field "${targetFieldId}" (source: "${sourceFieldName}") is not a valid number. Skipping.`);
          }
          break;
        case 'url':
          // Structure for a URL property: { url: "https://example.com" }
          notionProperties[targetFieldId] = { url: String(value) };
          break;
        case 'email':
          // Structure for an email property: { email: "user@example.com" }
          notionProperties[targetFieldId] = { email: String(value) };
          break;
        case 'phone_number':
          // Structure for a phone_number property: { phone_number: "123-456-7890" }
          notionProperties[targetFieldId] = { phone_number: String(value) };
          break;
        case 'checkbox':
          // Structure for a checkbox property: { checkbox: true } or { checkbox: false }
          let boolValue = false;
          if (typeof value === 'boolean') {
            boolValue = value;
          } else if (typeof value === 'string') {
            const lowerValue = value.toLowerCase().trim();
            boolValue = lowerValue === 'true' || lowerValue === '1' || lowerValue === 'yes' || lowerValue === 'on';
          } else if (typeof value === 'number') {
            boolValue = value === 1;
          }
          notionProperties[targetFieldId] = { checkbox: boolValue };
          break;
        case 'date':
          // Structure for a date property: { date: { start: "YYYY-MM-DDTHH:mm:ss.sssZ" } }
          // Optionally, 'end' and 'time_zone' can be included.
          if (value !== null && value !== undefined) { // Redundant check due to earlier global check, but harmless
            try {
                const dateObject = new Date(value);
                if (isNaN(dateObject.getTime())) { // Check if the date string was valid
                    console.warn(`NotionAdapter.sendData: Value "${value}" for date field "${targetFieldId}" (source: "${sourceFieldName}") is not a valid date string. Skipping.`);
                } else {
                    notionProperties[targetFieldId] = { date: { start: dateObject.toISOString() } };
                }
            } catch (e) { // Catch errors from new Date() constructor if value is highly malformed
                console.warn(`NotionAdapter.sendData: Error processing date value "${value}" for field "${targetFieldId}" (source: "${sourceFieldName}"): ${e.message}. Skipping.`);
            }
          }
          break;
        case 'select':
          // Structure for a select property: { select: { name: "Option Name" } }
          // The option must already exist in the database's select options.
          if (value !== null && value !== undefined && String(value).trim() !== '') {
            notionProperties[targetFieldId] = { select: { name: String(value).trim() } };
          }
          break;
        case 'multi_select':
          // Structure for a multi-select property: { multi_select: [{ name: "Option1" }, { name: "Option2" }] }
          // Options must already exist in the database's multi-select options.
          // Input 'value' can be an array or a comma/semicolon-separated string.
          if (value !== null && value !== undefined) { // Redundant check
            let optionsArray = [];
            if (Array.isArray(value)) {
                optionsArray = value.map(opt => ({ name: String(opt).trim() })).filter(opt => opt.name !== '');
            } else if (typeof value === 'string' && value.trim() !== '') {
                // Split by comma or semicolon, then trim whitespace and filter out empty strings.
                optionsArray = value.split(/[,;]/).map(opt => ({ name: opt.trim() })).filter(opt => opt.name !== '');
            }
            if (optionsArray.length > 0) {
                notionProperties[targetFieldId] = { multi_select: optionsArray };
            } else if (String(value).trim() !== ''){ // Warn only if there was initial non-empty value that resulted in no options
                 console.warn(`NotionAdapter.sendData: Value "${value}" for multi-select field "${targetFieldId}" (source: "${sourceFieldName}") did not yield any valid options. Skipping.`);
            }
          }
          break;
        case 'files':
          // Structure for a files property (external file link):
          // { files: [{ type: "external", name: "File Name", external: { url: "https://example.com/file.pdf" } }] }
          // This example assumes 'value' is a single URL string.
          // For multiple files or user-provided names, more complex handling would be needed.
          if (value !== null && value !== undefined && String(value).trim() !== '') {
            notionProperties[targetFieldId] = {
                files: [{ type: "external", name: "Uploaded File (via Extension)", external: { url: String(value).trim() } }]
            };
          }
          break;
        default:
          console.warn(`NotionAdapter.sendData: Unsupported Notion type "${targetFieldNotionType}" for field "${targetFieldId}" (source: "${sourceFieldName}"). Skipping.`);
      }
    }

    console.log(`NotionAdapter.sendData: Attempting to create new page in Notion. Target Database ID: ${targetDatabaseId}. Properties:`, JSON.stringify(notionProperties, null, 2));

    // Notion API endpoint for creating pages.
    const apiUrl = 'https://api.notion.com/v1/pages';
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28', // Specify the Notion API version.
    };
    // Construct the request body for the Notion API.
    // 'parent' specifies the database this new page belongs to.
    // 'properties' contains the structured data for each field.
    const body = JSON.stringify({
      parent: { database_id: targetDatabaseId },
      properties: notionProperties,
    });

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: headers,
        body: body,
      });

      if (response.ok) {
        const notionPage = await response.json();
        console.log(`NotionAdapter.sendData: Page created successfully in Notion. URL: ${notionPage.url}, ID: ${notionPage.id}`);
        return { success: true, pageUrl: notionPage.url, pageId: notionPage.id, message: 'Page created successfully in Notion.' };
      } else {
        // Attempt to parse error details from Notion's response.
        const errorData = await response.json().catch(() => ({ message: 'Could not parse error response from Notion API.' })); // Provide fallback if error parsing fails
        console.error(`NotionAdapter.sendData: Notion API Error ${response.status} (${response.statusText}). Details:`, errorData);
        const errorMessage = `Failed to create page: ${errorData.message || 'Unknown Notion API error'}`;
        return { success: false, error: `Notion API Error: ${response.status} ${response.statusText}`, details: errorData, message: errorMessage };
      }
    } catch (error) { // Catch network errors or other issues with the fetch call itself.
      console.error('NotionAdapter.sendData: Failed to send data to Notion due to a network or unexpected error:', error);
      return { success: false, error: 'Network or unexpected error during Notion API call.', details: error.message || String(error), message: `Error: ${error.message || 'Network error'}` };
    }
  }

  /**
   * Retrieves the schema (structure of properties) of a specified Notion database.
   *
   * @param {object} connectionDetails - Object containing authentication and target database information.
   * @param {string} connectionDetails.accessToken - The Notion API access token.
   * @param {string} connectionDetails.databaseId - The ID of the Notion database whose schema is to be retrieved.
   * @returns {Promise<Array<{id: string, name: string, type: string}>>} A promise that resolves to an array of `SchemaField` objects.
   *                                                                     Each object represents a property in the database and contains:
   *                                                                     `id` (string): The stable ID of the property.
   *                                                                     `name` (string): The user-visible name of the property.
   *                                                                     `type` (string): The Notion type of the property (e.g., 'title', 'rich_text', 'number').
   *                                                                     Returns an empty array if an error occurs, or if essential `connectionDetails` are missing.
   */
  async getSchema(connectionDetails) {
    if (!connectionDetails || !connectionDetails.accessToken || !connectionDetails.databaseId) {
      console.error('NotionAdapter.getSchema: Missing accessToken or databaseId in connectionDetails. Cannot fetch schema.');
      return [];
    }

    const { accessToken, databaseId } = connectionDetails;
    // API endpoint for retrieving database information, including its schema.
    const apiUrl = `https://api.notion.com/v1/databases/${databaseId}`;
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Notion-Version': '2022-06-28',
    };

    try {
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: headers,
      });

      if (!response.ok) {
        let errorDetails = 'No additional error details from API.';
        try {
          const errorData = await response.json();
          errorDetails = JSON.stringify(errorData);
        } catch (e) {
          // Error parsing the error response body, stick with the default message.
          console.warn(`NotionAdapter.getSchema: Could not parse error JSON from API for status ${response.status}.`);
        }
        console.error(
          `NotionAdapter.getSchema: API request to fetch schema failed with status ${response.status} (${response.statusText}). Database ID: ${databaseId}. Details: ${errorDetails}`
        );
        return [];
      }

      const dbSchemaResponse = await response.json();
      const transformedSchema = [];

      // The schema information is located in the 'properties' field of the database object.
      if (dbSchemaResponse && dbSchemaResponse.properties) {
        for (const propertyName in dbSchemaResponse.properties) {
          // Ensure the property is directly on the object and not from the prototype chain.
          if (Object.hasOwnProperty.call(dbSchemaResponse.properties, propertyName)) {
            const propertyDetails = dbSchemaResponse.properties[propertyName];
            transformedSchema.push({
              id: propertyDetails.id,       // Notion's stable ID for the property.
              name: propertyDetails.name,   // User-friendly name of the property.
              type: propertyDetails.type    // Notion's type for the property (e.g., 'title', 'rich_text').
            });
          }
        }
      } else {
        console.warn(`NotionAdapter.getSchema: 'properties' field missing in schema response for database ${databaseId}. Response:`, dbSchemaResponse);
      }
      return transformedSchema;
    } catch (error) {
      console.error(`NotionAdapter.getSchema: Error fetching schema for database ${databaseId}:`, error);
      return [];
    }
  }

  /**
   * Gets the display name for this adapter.
   * This name is used in UI elements to identify the service.
   * @returns {string} The display name "Notion".
   */
  getDisplayName() {
    return 'Notion';
  }

  /**
   * Gets the unique service ID for this adapter.
   * This ID is used internally to manage different adapters.
   * @returns {string} The service ID "notion".
   */
  getServiceId() {
    return 'notion';
  }

  /**
   * Checks if this adapter requires configuration by the user
   * (e.g., authentication, setting target database).
   * Notion adapter requires configuration (auth, database selection).
   * @returns {boolean} True, as Notion integration is configurable.
   */
  isConfigurable() {
    return true;
  }

  /**
   * Lists databases accessible to the authenticated Notion integration.
   * This is a private helper method, typically called after successful authentication
   * to allow the user to select a target database.
   *
   * @param {string} accessToken - The Notion API access token.
   * @returns {Promise<Array<{id: string, title: string}>>} A promise that resolves to an array of database objects.
   *                                                       Each object contains `id` (database ID) and `title` (database title).
   *                                                       Returns an empty array on error or if no databases are found.
   * @private
   * @sideeffect Makes a POST request to the Notion API's search endpoint.
   */
  async _listAccessibleDatabases(accessToken) {
    // Notion API endpoint for searching. We filter for objects of type 'database'.
    const apiUrl = 'https://api.notion.com/v1/search';
    const headers = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    };
    // The body specifies the filter: we only want 'database' objects.
    const body = JSON.stringify({
      filter: { property: 'object', value: 'database' },
      // Optionally, add 'sort' here if needed, e.g. { timestamp: 'last_edited_time', direction: 'descending' }
    });

    try {
      const response = await fetch(apiUrl, {
        method: 'POST', // Search endpoint uses POST
        headers: headers,
        body: body,
      });

      if (!response.ok) {
        let errorDetails = 'No additional error details from API.';
        try {
          const errorData = await response.json();
          errorDetails = JSON.stringify(errorData);
        } catch (e) {
          console.warn(`NotionAdapter._listAccessibleDatabases: Could not parse error JSON from API for status ${response.status}.`);
        }
        console.error(
          `NotionAdapter._listAccessibleDatabases: API request to list databases failed with status ${response.status} (${response.statusText}). Details: ${errorDetails}`
        );
        return [];
      }

      const searchData = await response.json();
      // The search results are in the 'results' array.
      if (searchData && searchData.results) {
        return searchData.results
          .map(db => {
            // Extract the database ID and title.
            // Database titles are typically an array of rich text objects; we need the plain_text from the first one.
            const titleArray = db.title;
            const titleText = (Array.isArray(titleArray) && titleArray.length > 0 && titleArray[0].plain_text)
                              ? titleArray[0].plain_text
                              : 'Untitled Database';
            return {
              id: db.id,
              title: titleText
            };
          })
          .filter(db => db.title); // Ensure only databases with a valid title are returned (though 'Untitled Database' is a fallback).
      }
      return []; // Return empty if no results or unexpected structure.
    } catch (error) {
      console.error('NotionAdapter._listAccessibleDatabases: Error fetching databases:', error);
      return [];
    }
  }
}

// module.exports = NotionAdapter; // Removed as per instruction
