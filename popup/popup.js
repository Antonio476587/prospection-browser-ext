// popup/popup.js

document.addEventListener('DOMContentLoaded', () => {
    const extractButton = document.getElementById('extract-button');
    const optionsButton = document.getElementById('options-button');
    const templateSelect = document.getElementById('template-select');
    const statusIndicator = document.getElementById('status-indicator');
    const notionWorkspaceName = document.getElementById('notion-workspace-name');
    const startSelectionButton = document.getElementById('start-selection-button');

    // Cargar estado de conexión y plantillas al abrir el popup
    updatePopupState();
    loadTemplates();

    if (extractButton) {
        extractButton.addEventListener('click', async () => {
            // Lógica para iniciar la extracción y envío de datos
            // Esto implicará enviar un mensaje al script de fondo (background.js)
            // y potencialmente al script de contenido (content_scraper.js)
            console.log('Botón de extracción presionado.');
            showStatus('Extrayendo datos...', 'processing');

            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab && tab.id) {
                    const selectedTemplateId = templateSelect.value;
                    if (!selectedTemplateId) {
                        showStatus('Por favor, selecciona una plantilla.', 'error');
                        return;
                    }
                    // Enviar mensaje al script de contenido para iniciar la extracción
                    // y luego al script de fondo para procesar y enviar a Notion.
                    chrome.runtime.sendMessage({
                        action: "startExtraction",
                        tabId: tab.id,
                        templateId: selectedTemplateId
                    }, response => {
                        if (chrome.runtime.lastError) {
                            console.error("Error al enviar mensaje de extracción:", chrome.runtime.lastError.message);
                            showStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
                            return;
                        }
                        if (response && response.success) {
                            showStatus('Datos enviados exitosamente.', 'success');
                        } else {
                            showStatus(response && response.message ? response.message : 'Error en la extracción/envío.', 'error');
                        }
                    });
                } else {
                    showStatus('No se pudo obtener la pestaña activa.', 'error');
                }
            } catch (error) {
                console.error("Error en la extracción:", error);
                showStatus(`Error: ${error.message}`, 'error');
            }
        });
    }

    if (optionsButton) {
        optionsButton.addEventListener('click', () => {
            chrome.runtime.openOptionsPage();
        });
    }

    if (startSelectionButton) {
        startSelectionButton.addEventListener('click', async () => {
            // Lógica para iniciar el modo de selección de elementos en la página activa
            // Esto enviará un mensaje al script de contenido
            console.log('Iniciar modo de selección de elementos.');
            showStatus('Iniciando modo de selección...', 'processing');
            try {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                if (tab && tab.id) {
                     chrome.tabs.sendMessage(tab.id, { action: "activateElementSelectionMode" }, response => {
                        if (chrome.runtime.lastError) {
                            console.error("Error al activar modo selección:", chrome.runtime.lastError.message);
                            showStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
                            return;
                        }
                        if (response && response.status === "activated") {
                            showStatus('Modo selección activado. Haz clic en elementos en la página.', 'success');
                            window.close(); // Cerrar popup para que el usuario interactúe con la página
                        } else {
                            showStatus('No se pudo activar el modo selección.', 'error');
                        }
                    });
                } else {
                     showStatus('No se pudo obtener la pestaña activa para selección.', 'error');
                }
            } catch (error) {
                console.error("Error al iniciar selección:", error);
                showStatus(`Error: ${error.message}`, 'error');
            }
        });
    }

    // Función para actualizar el estado de la conexión a Notion
    async function updatePopupState() {
        try {
            const data = await chrome.storage.sync.get(['notionConnection']);
            if (data.notionConnection && data.notionConnection.accessToken && data.notionConnection.workspaceName) {
                statusIndicator.textContent = 'Conectado a Notion';
                statusIndicator.className = 'status-connected';
                notionWorkspaceName.textContent = `Workspace: ${data.notionConnection.workspaceName}`;
                extractButton.disabled = false;
            } else {
                statusIndicator.textContent = 'Desconectado';
                statusIndicator.className = 'status-disconnected';
                notionWorkspaceName.textContent = 'Por favor, conecta con Notion en Opciones.';
                extractButton.disabled = true;
            }
        } catch (error) {
            console.error("Error al obtener estado de Notion:", error);
            statusIndicator.textContent = 'Error de estado';
            statusIndicator.className = 'status-error';
            extractButton.disabled = true;
        }
    }

    // Función para cargar las plantillas en el selector
    async function loadTemplates() {
        try {
            const data = await chrome.storage.sync.get(['templates']);
            templateSelect.innerHTML = '<option value="">-- Sin Plantillas --</option>'; // Limpiar opciones existentes
            if (data.templates && data.templates.length > 0) {
                data.templates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.id;
                    option.textContent = template.name;
                    templateSelect.appendChild(option);
                });
            } else {
                 const option = document.createElement('option');
                 option.value = "";
                 option.textContent = "-- No hay plantillas creadas --";
                 option.disabled = true;
                 templateSelect.appendChild(option);
            }
        } catch (error) {
            console.error("Error al cargar plantillas:", error);
            const option = document.createElement('option');
            option.value = "";
            option.textContent = "-- Error al cargar plantillas --";
            option.disabled = true;
            templateSelect.appendChild(option);
        }
    }
    
    function showStatus(message, type = 'info') { // type can be 'info', 'success', 'error', 'processing'
        // En un popup real, podrías tener un elemento dedicado para mensajes
        // Por ahora, actualizaremos el span de estado general
        statusIndicator.textContent = message;
        statusIndicator.className = `status-${type}`;
        console.log(`Popup Status (${type}): ${message}`);

        // Re-enable extract button unless it's a processing message
        if (extractButton && type !== 'processing') {
            // Re-check connection status to decide if button should be enabled
            chrome.storage.sync.get(['notionConnection'], (data) => {
                if (data.notionConnection && data.notionConnection.accessToken) {
                    extractButton.disabled = false;
                } else {
                    extractButton.disabled = true;
                }
            });
        } else if (extractButton) {
            extractButton.disabled = true;
        }
    }

    // Escuchar mensajes del background script (por ejemplo, actualizaciones de estado)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "updatePopupStatus") {
            updatePopupState();
            loadTemplates();
        }
        if (request.action === "extractionStatusUpdate") {
            showStatus(request.message, request.statusType);
        }
    });
});
