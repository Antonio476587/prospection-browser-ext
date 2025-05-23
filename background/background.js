// background/background.js (Service Worker)

// Constantes para la configuración de OAuth de Notion (Ejemplo - Reemplazar con tus valores reales)
// IMPORTANTE: El CLIENT_SECRET NO debe estar aquí en una extensión de producción si es posible.
// Considera un backend para el intercambio de tokens si la seguridad es primordial.
// Para este ejemplo, se asume que se maneja aquí con el riesgo documentado.
const NOTION_CLIENT_ID = 'TU_NOTION_CLIENT_ID'; // Reemplazar
const NOTION_CLIENT_SECRET = 'TU_NOTION_CLIENT_SECRET'; // Reemplazar
const NOTION_REDIRECT_URI = chrome.identity.getRedirectURL("oauth2"); // o una ruta personalizada como "callback"

// Almacenar el token de acceso de Notion de forma segura
// chrome.storage.sync o chrome.storage.local

// Evento de instalación: se puede usar para configurar valores iniciales
chrome.runtime.onInstalled.addListener(() => {
    console.log('Extensión de Extracción de Datos instalada.');
    // Inicializar almacenamiento si es necesario
    chrome.storage.sync.get(['templates', 'notionConnection', 'userPreferences'], (data) => {
        if (!data.templates) {
            chrome.storage.sync.set({ templates: [] });
        }
        if (!data.notionConnection) {
            chrome.storage.sync.set({ notionConnection: {} });
        }
        // Inicializar otras configuraciones
    });
});

// Manejador de mensajes desde otras partes de la extensión (popup, options, content scripts)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Mensaje recibido en background.js:', request);

    if (request.action === "connectNotion") {
        // Iniciar flujo OAuth 2.0 para Notion
        const authUrl = `https://api.notion.com/v1/oauth/authorize?client_id=${NOTION_CLIENT_ID}&redirect_uri=${encodeURIComponent(NOTION_REDIRECT_URI)}&response_type=code&owner=user`;
        
        chrome.identity.launchWebAuthFlow({
            url: authUrl,
            interactive: true
        }, async (redirectUrl) => {
            if (chrome.runtime.lastError || !redirectUrl) {
                console.error("Error en launchWebAuthFlow:", chrome.runtime.lastError?.message);
                sendResponse({ success: false, message: `Error de autenticación: ${chrome.runtime.lastError?.message || 'Flujo cancelado.'}` });
                // Notificar a la página de opciones
                chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: false, message: `Error de autenticación: ${chrome.runtime.lastError?.message || 'Flujo cancelado.'}`}).catch(e => console.debug(e));
                return;
            }

            const urlParams = new URLSearchParams(new URL(redirectUrl).search);
            const code = urlParams.get('code');

            if (code) {
                // Intercambiar código por token de acceso
                try {
                    const tokenResponse = await fetch('https://api.notion.com/v1/oauth/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Basic ${btoa(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`)}`
                        },
                        body: JSON.stringify({
                            grant_type: 'authorization_code',
                            code: code,
                            redirect_uri: NOTION_REDIRECT_URI
                        })
                    });

                    const tokenData = await tokenResponse.json();

                    if (tokenData.access_token) {
                        await chrome.storage.sync.set({ 
                            notionConnection: {
                                accessToken: tokenData.access_token,
                                workspaceName: tokenData.workspace_name,
                                workspaceIcon: tokenData.workspace_icon,
                                botId: tokenData.bot_id
                                // Podrías querer almacenar también tokenData.token_type, etc.
                            }
                        });
                        console.log('Notion conectado exitosamente.');
                        sendResponse({ success: true, message: 'Notion conectado exitosamente.' });
                        // Notificar a la página de opciones y al popup
                        chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: true, message: 'Conectado a Notion.'}).catch(e => console.debug(e));

                    } else {
                        console.error('Error al obtener token de acceso de Notion:', tokenData);
                        sendResponse({ success: false, message: `Error al obtener token: ${tokenData.error || 'Respuesta inválida del servidor.'}` });
                        chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: false, message: `Error al obtener token: ${tokenData.error || 'Respuesta inválida.'}`}).catch(e => console.debug(e));
                    }
                } catch (error) {
                    console.error('Error en el intercambio de token de Notion:', error);
                    sendResponse({ success: false, message: `Error de red o servidor: ${error.message}` });
                    chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: false, message: `Error de red: ${error.message}`}).catch(e => console.debug(e));
                }
            } else {
                const error = urlParams.get('error');
                console.error('OAuth denegado o error:', error);
                sendResponse({ success: false, message: `OAuth denegado: ${error || 'Código no recibido.'}` });
                chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: false, message: `OAuth denegado: ${error || 'Código no recibido.'}`}).catch(e => console.debug(e));
            }
        });
        return true; // Indica que la respuesta se enviará asíncronamente
    } 
    else if (request.action === "disconnectNotion") {
        // Lógica para desconectar de Notion (principalmente borrar el token almacenado)
        // Notion no tiene un endpoint de revocación de token OAuth estándar para integraciones públicas fácilmente accesible.
        // La desconexión es principalmente local.
        chrome.storage.sync.remove('notionConnection', () => {
            if (chrome.runtime.lastError) {
                console.error("Error al borrar token de Notion:", chrome.runtime.lastError.message);
                sendResponse({ success: false, message: "Error al desconectar." });
            } else {
                console.log('Desconectado de Notion (token local borrado).');
                sendResponse({ success: true, message: "Desconectado de Notion." });
                 // Notificar a la página de opciones y al popup
                chrome.runtime.sendMessage({ action: "notionConnectionUpdate", success: true, message: 'Desconectado de Notion.'}).catch(e => console.debug(e));
            }
        });
        return true; // Asíncrono
    }
    else if (request.action === "startExtraction") {
        // 1. Obtener la plantilla y la conexión a Notion
        // 2. Enviar mensaje al content_scraper.js para extraer datos según la plantilla
        // 3. Recibir datos del content_scraper.js
        // 4. Formatear datos y enviarlos a Notion usando el NotionAdapter
        (async () => {
            try {
                const { notionConnection, templates } = await chrome.storage.sync.get(['notionConnection', 'templates']);
                if (!notionConnection || !notionConnection.accessToken) {
                    sendResponse({ success: false, message: "No conectado a Notion." });
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
                
                // Enviar mensaje al script de contenido para extraer datos
                const extractedData = await chrome.tabs.sendMessage(request.tabId, {
                    action: "extractDataFromPage",
                    template: template
                });

                if (extractedData && extractedData.success) {
                    // Aquí iría la lógica para usar el NotionAdapter
                    // Por ahora, simulamos el envío
                    console.log("Datos extraídos:", extractedData.data);
                    console.log("Enviando a Notion con plantilla:", template.name);
                    
                    // Ejemplo de cómo podrías llamar a una función del adaptador (que no existe aún completamente)
                    // const notionAdapter = new NotionAdapter(notionConnection.accessToken);
                    // const result = await notionAdapter.sendData(extractedData.data, template);

                    // Simulación de llamada a Notion API
                    // Este es un marcador de posición MUY simplificado.
                    // La lógica real de `sendDataToNotion` sería mucho más compleja.
                    const notionResult = await sendDataToNotionAPI(
                        notionConnection.accessToken,
                        template.targetDetails.notionDatabaseId,
                        extractedData.data, // Los datos extraídos
                        template.fieldMappings // El mapeo de la plantilla
                    );

                    if (notionResult.success) {
                        sendResponse({ success: true, message: "Datos enviados a Notion (simulado)." });
                        chrome.notifications.create({
                            type: 'basic',
                            iconUrl: '../icons/icon48.png',
                            title: 'Extracción Exitosa',
                            message: `Datos enviados a Notion usando la plantilla '${template.name}'.`
                        });
                    } else {
                        sendResponse({ success: false, message: notionResult.message || "Error al enviar a Notion (simulado)." });
                    }

                } else {
                    sendResponse({ success: false, message: extractedData.message || "Error al extraer datos de la página." });
                }

            } catch (error) {
                console.error("Error durante la extracción/envío:", error);
                sendResponse({ success: false, message: `Error: ${error.message}` });
            }
        })();
        return true; // Asíncrono
    }
    else if (request.action === "fetchNotionDatabases") {
        (async () => {
            try {
                const { notionConnection } = await chrome.storage.sync.get(['notionConnection']);
                if (!notionConnection || !notionConnection.accessToken) {
                    sendResponse({ success: false, message: "No conectado a Notion." });
                    return;
                }

                // La API de Notion para listar bases de datos a las que una integración tiene acceso
                // es a través del endpoint de búsqueda, filtrando por "database".
                const response = await fetch('https://api.notion.com/v1/search', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${notionConnection.accessToken}`,
                        'Notion-Version': '2022-06-28',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        filter: {
                            value: 'database',
                            property: 'object'
                        }
                        // Puedes añadir sort u otros parámetros si es necesario
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
        return true; // Asíncrono
    }
    // Otros manejadores de mensajes...
    return false; // Para respuestas síncronas o si no se maneja el mensaje
});


// Placeholder para la función que realmente interactúa con la API de Notion
// Esta función necesitaría ser mucho más robusta y estar idealmente en notion_adapter.js
async function sendDataToNotionAPI(accessToken, databaseId, extractedData, fieldMappings) {
    // Construir el objeto 'properties' para la API de Notion
    const notionProperties = {};

    for (const mapping of fieldMappings) {
        const sourceValue = extractedData[mapping.sourceFieldName]; // Asume que extractedData es un objeto con sourceFieldName como claves

        if (sourceValue !== undefined && sourceValue !== null) {
            // Aquí necesitas convertir sourceValue al formato que Notion espera para mapping.targetFieldNotionType
            // Esto es una simplificación extrema.
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
                    }
                    break;
                case 'url':
                     if (String(sourceValue).startsWith('http')) {
                        notionProperties[mapping.targetFieldId] = { url: String(sourceValue) };
                    }
                    break;
                case 'email':
                    // Añadir validación de email si es necesario
                    notionProperties[mapping.targetFieldId] = { email: String(sourceValue) };
                    break;
                case 'checkbox':
                    notionProperties[mapping.targetFieldId] = { checkbox: Boolean(sourceValue) };
                    break;
                // Añadir más tipos según la especificación de la API de Notion y los tipos de plantilla
                // date, select, multi_select, files (más complejo), etc.
                default:
                    console.warn(`Tipo de campo Notion no manejado en simulación: ${mapping.targetFieldNotionType} para ${mapping.targetFieldId}`);
                    // Por defecto, intentar como rich_text si no se especifica
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

    console.log("Enviando a Notion (simulado):", JSON.stringify(body, null, 2));

    try {
        const response = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
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
            return { success: false, message: `Error de Notion: ${responseData.message || response.statusText}` };
        }
    } catch (error) {
        console.error("Error de red al enviar a Notion:", error);
        return { success: false, message: `Error de red: ${error.message}` };
    }
}
