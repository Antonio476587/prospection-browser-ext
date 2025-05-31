// background/background.js (Service Worker - Internal Token Version)

// No OAuth constants (NOTION_CLIENT_ID, NOTION_CLIENT_SECRET, NOTION_REDIRECT_URI) are needed.
// The Internal Integration Token will be provided by the user and stored.

chrome.runtime.onInstalled.addListener(() => {
    console.log('Extensión de Extracción de Datos (Internal Token Version) instalada.');
    // Initialize storage if necessary
    chrome.storage.sync.get(['templates', 'notionConnection', 'userPreferences'], (data) => {
        if (!data.templates) {
            chrome.storage.sync.set({ templates: [] });
        }
        // Ensure notionConnection is an object; it will store the internal token
        if (typeof data.notionConnection !== 'object' || data.notionConnection === null) {
            chrome.storage.sync.set({ notionConnection: {} });
        }
        // Initialize other configurations
    });
});

// Message handler
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Mensaje recibido en background.js (Internal Token Version):', request);

    if (request.action === "connectNotionWithInternalToken") {
        // This action is triggered from options.js when the user provides an internal token
        const userProvidedToken = request.token;

        if (!userProvidedToken || !userProvidedToken.startsWith('secret_')) {
            sendResponse({ success: false, message: 'Token interno inválido o no proporcionado.' });
            chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: false, message: 'Token interno inválido.' }).catch(e => console.debug("Error sending message or popup not open", e));
            return false; // Not async in this path
        }

        // Validate the token by making a simple API call
        (async () => {
            try {
                const validationResponse = await fetch('https://api.notion.com/v1/users/me', { // More specific endpoint for user info
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${userProvidedToken}`,
                        'Notion-Version': '2022-06-28',
                        'Content-Type': 'application/json'
                    }
                });

                if (validationResponse.ok) {
                    const userData = await validationResponse.json();
                    // userData might contain bot.owner.workspace_name if the token has user capabilities,
                    // but for a pure bot token, workspace name might not be directly available.
                    // We'll use a placeholder or let the user define it.
                    await chrome.storage.sync.set({
                        notionConnection: {
                            internalToken: userProvidedToken,
                            connected: true,
                            workspaceName: userData?.bot?.owner?.workspace_name || "Workspace (Token Interno)",
                            botId: userData?.bot?.id // Store bot ID if available
                        }
                    });
                    console.log('Notion conectado exitosamente con Token Interno.');
                    sendResponse({ success: true, message: 'Notion conectado con Token Interno.' });
                    chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: true, message: 'Conectado a Notion (Token Interno).' }).catch(e => console.debug("Error sending message or popup not open",e));
                } else {
                    const errorData = await validationResponse.json();
                    console.error('Error al validar Token Interno de Notion:', errorData);
                    sendResponse({ success: false, message: `Token Interno inválido: ${errorData.message || 'Error de API'}` });
                    chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: false, message: `Token Interno inválido: ${errorData.message || 'Error de API'}` }).catch(e => console.debug("Error sending message or popup not open",e));
                }
            } catch (error) {
                console.error('Error en la validación del Token Interno de Notion:', error);
                sendResponse({ success: false, message: `Error de red o servidor: ${error.message}` });
                chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: false, message: `Error de red: ${error.message}` }).catch(e => console.debug("Error sending message or popup not open",e));
            }
        })();
        return true; // Indicates asynchronous response
    }
    else if (request.action === "disconnectNotion") {
        // Clear the stored internal token
        chrome.storage.sync.set({ notionConnection: {} }, () => { // Reset to empty object
            if (chrome.runtime.lastError) {
                console.error("Error al borrar token interno de Notion:", chrome.runtime.lastError.message);
                sendResponse({ success: false, message: "Error al desconectar." });
            } else {
                console.log('Desconectado de Notion (token interno local borrado).');
                sendResponse({ success: true, message: "Desconectado de Notion." });
                chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: true, message: 'Desconectado de Notion.' }).catch(e => console.debug("Error sending message or popup not open",e));
            }
        });
        return true; // Asynchronous
    }
    else if (request.action === "startExtraction") {
        (async () => {
            try {
                const { notionConnection, templates } = await chrome.storage.sync.get(['notionConnection', 'templates']);

                if (!notionConnection || !notionConnection.internalToken || !notionConnection.connected) {
                    sendResponse({ success: false, message: "No conectado a Notion con un token interno válido." });
                    return;
                }
                if (!templates || templates.length === 0) {
                    sendResponse({ success: false, message: "No hay plantillas disponibles." });
                    return;
                }

                const template = templates.find(t => t.id === request.templateId);
                if (!template) {
                    sendResponse({ success: false, message: "Plantilla no encontrada." });
                    return;
                }

                const extractedData = await chrome.tabs.sendMessage(request.tabId, {
                    action: "extractDataFromPage",
                    template: template
                });

                if (extractedData && extractedData.success) {
                    console.log("Datos extraídos:", extractedData.data);
                    console.log("Enviando a Notion con plantilla:", template.name);

                    const notionResult = await sendDataToNotionAPI(
                        notionConnection.internalToken, // Using the internal token
                        template.targetDetails.notionDatabaseId,
                        extractedData.data,
                        template.fieldMappings
                    );

                    if (notionResult.success) {
                        sendResponse({ success: true, message: "Datos enviados a Notion." });
                        chrome.notifications.create({
                            type: 'basic',
                            iconUrl: chrome.runtime.getURL('icons/icon48.png'), // Use chrome.runtime.getURL for extension resources
                            title: 'Extracción Exitosa',
                            message: `Datos enviados a Notion usando la plantilla '${template.name}'.`
                        });
                    } else {
                        sendResponse({ success: false, message: notionResult.message || "Error al enviar a Notion." });
                    }
                } else {
                    sendResponse({ success: false, message: extractedData.message || "Error al extraer datos de la página." });
                }
            } catch (error) {
                console.error("Error durante la extracción/envío:", error);
                sendResponse({ success: false, message: `Error: ${error.message}` });
            }
        })();
        return true; // Asynchronous
    }
    else if (request.action === "fetchNotionDatabases") {
        (async () => {
            try {
                const { notionConnection } = await chrome.storage.sync.get(['notionConnection']);
                if (!notionConnection || !notionConnection.internalToken || !notionConnection.connected) {
                    sendResponse({ success: false, message: "No conectado a Notion con un token interno válido." });
                    return;
                }

                const response = await fetch('https://api.notion.com/v1/search', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${notionConnection.internalToken}`, // Using the internal token
                        'Notion-Version': '2022-06-28',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        filter: {
                            value: 'database',
                            property: 'object'
                        }
                    })
                });

                if (!response.ok) {
                    const errorData = await response.json();
                    console.error("Error al obtener bases de datos de Notion:", errorData);
                    throw new Error(`Error de API de Notion: ${errorData.message || response.statusText}`);
                }

                const searchData = await response.json();
                const databases = searchData.results.map(db => ({
                    id: db.id,
                    title: db.title && db.title.length > 0 ? db.title[0].plain_text : "Base de datos sin título"
                }));

                sendResponse({ success: true, databases: databases });

            } catch (error) {
                console.error("Error al obtener bases de datos de Notion:", error);
                sendResponse({ success: false, message: `Error al obtener bases de datos: ${error.message}` });
            }
        })();
        return true; // Asynchronous
    }
    return false; // Default for unhandled actions
});


async function sendDataToNotionAPI(token, databaseId, extractedData, fieldMappings) {
    const notionProperties = {};

    for (const mapping of fieldMappings) {
        const sourceValue = extractedData[mapping.sourceFieldName];

        if (sourceValue !== undefined && sourceValue !== null) {
            // This switch handles the conversion of extracted data to Notion's expected property formats.
            // It's crucial to expand this for all supported Notion property types.
            switch (mapping.targetFieldNotionType) {
                case 'title':
                    notionProperties[mapping.targetFieldId] = { title: [{ text: { content: String(sourceValue) } }] };
                    break;
                case 'rich_text':
                    notionProperties[mapping.targetFieldId] = { rich_text: [{ text: { content: String(sourceValue) } }] };
                    break;
                case 'number':
                    const num = parseFloat(sourceValue);
                    if (!isNaN(num)) {
                        notionProperties[mapping.targetFieldId] = { number: num };
                    } else {
                        console.warn(`Could not parse "${sourceValue}" as number for field ${mapping.targetFieldId}`);
                    }
                    break;
                case 'url':
                     if (String(sourceValue).startsWith('http://') || String(sourceValue).startsWith('https://')) {
                        notionProperties[mapping.targetFieldId] = { url: String(sourceValue) };
                    } else {
                        console.warn(`Invalid URL format "${sourceValue}" for field ${mapping.targetFieldId}`);
                    }
                    break;
                case 'email':
                    // Basic email validation could be added here
                    notionProperties[mapping.targetFieldId] = { email: String(sourceValue) };
                    break;
                case 'checkbox':
                    // Convert common string representations of boolean to actual boolean
                    let boolValue = false;
                    if (typeof sourceValue === 'boolean') {
                        boolValue = sourceValue;
                    } else if (typeof sourceValue === 'string') {
                        const lowerSourceValue = sourceValue.toLowerCase();
                        if (lowerSourceValue === 'true' || lowerSourceValue === 'yes' || lowerSourceValue === '1') {
                            boolValue = true;
                        } else if (lowerSourceValue === 'false' || lowerSourceValue === 'no' || lowerSourceValue === '0') {
                            boolValue = false;
                        }
                    }
                    notionProperties[mapping.targetFieldId] = { checkbox: boolValue };
                    break;
                case 'select': // For 'select', Notion expects an object with 'name' or 'id' of the option
                    if (sourceValue) { // Assuming sourceValue is the name of the select option
                        notionProperties[mapping.targetFieldId] = { select: { name: String(sourceValue) } };
                    }
                    break;
                case 'multi_select': // For 'multi_select', Notion expects an array of option objects
                    if (Array.isArray(sourceValue)) {
                        notionProperties[mapping.targetFieldId] = { multi_select: sourceValue.map(opt => ({ name: String(opt) })) };
                    } else if (typeof sourceValue === 'string' && sourceValue.trim() !== '') { // Handle comma-separated string as multiple options
                        notionProperties[mapping.targetFieldId] = { multi_select: sourceValue.split(',').map(opt => ({ name: String(opt).trim() })) };
                    }
                    break;
                case 'date': // Notion expects an ISO 8601 date string, e.g., "2024-05-24" or with time "2024-05-24T12:00:00Z"
                    // This assumes sourceValue is already in a compatible format or can be parsed.
                    // More robust date parsing might be needed.
                    if (sourceValue) {
                         try {
                            // Attempt to create a date object to validate, then reformat if necessary
                            // For simplicity, assuming sourceValue is already a valid ISO string for Notion
                            notionProperties[mapping.targetFieldId] = { date: { start: String(sourceValue) } };
                         } catch (e) {
                            console.warn(`Invalid date format "${sourceValue}" for field ${mapping.targetFieldId}`);
                         }
                    }
                    break;
                // Add cases for 'people', 'files', 'phone_number', etc. as needed.
                default:
                    console.warn(`Tipo de campo Notion no manejado: ${mapping.targetFieldNotionType} para ${mapping.targetFieldId}. Usando rich_text por defecto.`);
                    notionProperties[mapping.targetFieldId] = { rich_text: [{ text: { content: String(sourceValue) } }] };
            }
        }
    }

    if (Object.keys(notionProperties).length === 0) {
        console.warn("No hay propiedades para enviar a Notion después del mapeo.");
        return { success: false, message: "No hay datos mapeados para enviar." };
    }

    const body = {
        parent: { database_id: databaseId },
        properties: notionProperties
    };

    console.log("Enviando a Notion:", JSON.stringify(body, null, 2));

    try {
        const response = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`, // Using the provided token (internal)
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const responseData = await response.json();

        if (response.ok) {
            console.log("Página creada en Notion:", responseData);
            return { success: true, data: responseData };
        } else {
            console.error("Error al crear página en Notion:", responseData);
            return { success: false, message: `Error de Notion: ${responseData.message || response.statusText} (Code: ${responseData.code})` };
        }
    } catch (error) {
        console.error("Error de red al enviar a Notion:", error);
        return { success: false, message: `Error de red: ${error.message}` };
    }
}
