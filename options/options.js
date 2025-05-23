// options/options.js

document.addEventListener('DOMContentLoaded', () => {
    // Pestañas
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(button.dataset.tab).classList.add('active');
        });
    });

    // Lógica para Conexiones API (Notion)
    const connectNotionButton = document.getElementById('connect-notion-button');
    const disconnectNotionButton = document.getElementById('disconnect-notion-button');
    const notionStatusElement = document.getElementById('notion-connection-status');
    const notionWorkspaceDetails = document.getElementById('notion-workspace-details');

    async function updateNotionConnectionStatus() {
        try {
            const data = await chrome.storage.sync.get('notionConnection');
            if (data.notionConnection && data.notionConnection.accessToken) {
                notionStatusElement.textContent = 'Conectado';
                notionStatusElement.className = 'status-connected';
                notionWorkspaceDetails.textContent = `Workspace: ${data.notionConnection.workspaceName || 'N/A'}`;
                connectNotionButton.style.display = 'none';
                disconnectNotionButton.style.display = 'inline-block';
            } else {
                notionStatusElement.textContent = 'Desconectado';
                notionStatusElement.className = 'status-disconnected';
                notionWorkspaceDetails.textContent = '';
                connectNotionButton.style.display = 'inline-block';
                disconnectNotionButton.style.display = 'none';
            }
        } catch (error) {
            console.error("Error al actualizar estado de Notion:", error);
            notionStatusElement.textContent = 'Error';
            notionStatusElement.className = 'status-error';
        }
    }

    if (connectNotionButton) {
        connectNotionButton.addEventListener('click', () => {
            // Enviar mensaje al background script para iniciar OAuth
            chrome.runtime.sendMessage({ action: "connectNotion" }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error("Error al conectar con Notion:", chrome.runtime.lastError.message);
                    showOptionsStatus(`Error al conectar: ${chrome.runtime.lastError.message}`, 'error');
                    return;
                }
                if (response && response.success) {
                    showOptionsStatus('Conexión con Notion iniciada. Sigue las instrucciones en la nueva pestaña.', 'success');
                    // El estado se actualizará a través de un mensaje del background o al recargar
                } else {
                    showOptionsStatus(response && response.message ? response.message : 'No se pudo iniciar la conexión con Notion.', 'error');
                }
            });
        });
    }

    if (disconnectNotionButton) {
        disconnectNotionButton.addEventListener('click', () => {
            chrome.runtime.sendMessage({ action: "disconnectNotion" }, (response) => {
                 if (chrome.runtime.lastError) {
                    console.error("Error al desconectar de Notion:", chrome.runtime.lastError.message);
                    showOptionsStatus(`Error al desconectar: ${chrome.runtime.lastError.message}`, 'error');
                    return;
                }
                if (response && response.success) {
                    showOptionsStatus('Desconectado de Notion exitosamente.', 'success');
                    updateNotionConnectionStatus();
                } else {
                    showOptionsStatus(response && response.message ? response.message : 'No se pudo desconectar de Notion.', 'error');
                }
            });
        });
    }
    
    // Lógica para Gestión de Plantillas
    const createNewTemplateButton = document.getElementById('create-new-template-button');
    const templateEditorModal = document.getElementById('template-editor-modal');
    const closeTemplateEditorButton = document.getElementById('close-template-editor');
    const cancelTemplateEditorButton = document.getElementById('cancel-template-editor');
    const templateForm = document.getElementById('template-form');
    const fieldMappingsContainer = document.getElementById('field-mappings-container');
    const addFieldMappingButton = document.getElementById('add-field-mapping-button');
    const templateListContainer = document.getElementById('template-list-container');
    const notionDatabaseSelect = document.getElementById('notion-database-select');
    const fetchNotionDatabasesButton = document.getElementById('fetch-notion-databases');


    if (createNewTemplateButton) {
        createNewTemplateButton.addEventListener('click', () => {
            document.getElementById('template-editor-title').textContent = 'Crear Nueva Plantilla';
            templateForm.reset();
            document.getElementById('template-id').value = '';
            fieldMappingsContainer.innerHTML = ''; // Limpiar mapeos existentes
            addInitialFieldMapping(); // Añadir un campo inicial
            templateEditorModal.style.display = 'block';
            updateTargetDetailsVisibility();
        });
    }
    
    function closeEditor() {
        templateEditorModal.style.display = 'none';
    }

    if (closeTemplateEditorButton) closeTemplateEditorButton.addEventListener('click', closeEditor);
    if (cancelTemplateEditorButton) cancelTemplateEditorButton.addEventListener('click', closeEditor);

    if (addFieldMappingButton) {
        addFieldMappingButton.addEventListener('click', () => {
            addFieldMapping(null, true); // Añadir un nuevo campo vacío, editable
        });
    }
    
    document.getElementById('template-target-platform')?.addEventListener('change', updateTargetDetailsVisibility);

    function updateTargetDetailsVisibility() {
        const targetPlatform = document.getElementById('template-target-platform').value;
        document.getElementById('notion-target-details').style.display = (targetPlatform === 'notion') ? 'block' : 'none';
        // Añadir lógica para otros destinos si es necesario
    }


    function addInitialFieldMapping() {
        // Añade un campo de mapeo inicial al abrir el editor para una nueva plantilla
        // Puedes personalizarlo según los campos más comunes
        addFieldMapping({
            sourceFieldName: 'Nombre del Perfil',
            sourceSelector: 'h1.text-heading-xlarge', // Ejemplo para LinkedIn
            sourceAttribute: 'textContent',
            targetFieldId: 'Name', // Propiedad 'Name' en Notion
            targetFieldNotionType: 'title'
        }, true); // editable
    }
    
    function addFieldMapping(mapping = {}, editable = true) {
        const mappingDiv = document.createElement('div');
        mappingDiv.className = 'field-mapping-item';
        
        const uniqueId = `mapping-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        mappingDiv.innerHTML = `
            <div class="form-group">
                <label for="sourceFieldName-${uniqueId}">Nombre Campo (Origen):</label>
                <input type="text" id="sourceFieldName-${uniqueId}" class="sourceFieldName" value="${mapping.sourceFieldName || ''}" placeholder="Ej: Título del Puesto" ${editable ? '' : 'readonly'}>
            </div>
            <div class="form-group">
                <label for="sourceSelector-${uniqueId}">Selector (Origen):</label>
                <input type="text" id="sourceSelector-${uniqueId}" class="sourceSelector" value="${mapping.sourceSelector || ''}" placeholder="Ej: .pv-entity__secondary-title" ${editable ? '' : 'readonly'}>
            </div>
            <div class="form-group">
                <label for="sourceAttribute-${uniqueId}">Atributo (Origen):</label>
                <input type="text" id="sourceAttribute-${uniqueId}" class="sourceAttribute" value="${mapping.sourceAttribute || 'textContent'}" placeholder="textContent, href, src" ${editable ? '' : 'readonly'}>
            </div>
            <div class="form-group">
                <label for="targetFieldId-${uniqueId}">ID Campo (Destino Notion):</label>
                <input type="text" id="targetFieldId-${uniqueId}" class="targetFieldId" value="${mapping.targetFieldId || ''}" placeholder="Ej: Nombre de propiedad en Notion" ${editable ? '' : 'readonly'}>
            </div>
             <div class="form-group">
                <label for="targetFieldNotionType-${uniqueId}">Tipo Campo (Notion):</label>
                <select id="targetFieldNotionType-${uniqueId}" class="targetFieldNotionType" ${editable ? '' : 'disabled'}>
                    <option value="title" ${mapping.targetFieldNotionType === 'title' ? 'selected' : ''}>Title</option>
                    <option value="rich_text" ${mapping.targetFieldNotionType === 'rich_text' ? 'selected' : ''}>Rich Text</option>
                    <option value="number" ${mapping.targetFieldNotionType === 'number' ? 'selected' : ''}>Number</option>
                    <option value="select" ${mapping.targetFieldNotionType === 'select' ? 'selected' : ''}>Select</option>
                    <option value="multi_select" ${mapping.targetFieldNotionType === 'multi_select' ? 'selected' : ''}>Multi-select</option>
                    <option value="date" ${mapping.targetFieldNotionType === 'date' ? 'selected' : ''}>Date</option>
                    <option value="people" ${mapping.targetFieldNotionType === 'people' ? 'selected' : ''}>People</option>
                    <option value="files" ${mapping.targetFieldNotionType === 'files' ? 'selected' : ''}>Files & Media</option>
                    <option value="checkbox" ${mapping.targetFieldNotionType === 'checkbox' ? 'selected' : ''}>Checkbox</option>
                    <option value="url" ${mapping.targetFieldNotionType === 'url' ? 'selected' : ''}>URL</option>
                    <option value="email" ${mapping.targetFieldNotionType === 'email' ? 'selected' : ''}>Email</option>
                    <option value="phone_number" ${mapping.targetFieldNotionType === 'phone_number' ? 'selected' : ''}>Phone</option>
                    <option value="formula" ${mapping.targetFieldNotionType === 'formula' ? 'selected' : ''}>Formula (Read-only)</option>
                    <option value="relation" ${mapping.targetFieldNotionType === 'relation' ? 'selected' : ''}>Relation (Read-only)</option>
                    <option value="rollup" ${mapping.targetFieldNotionType === 'rollup' ? 'selected' : ''}>Rollup (Read-only)</option>
                    <option value="created_time" ${mapping.targetFieldNotionType === 'created_time' ? 'selected' : ''}>Created time (Read-only)</option>
                    <option value="created_by" ${mapping.targetFieldNotionType === 'created_by' ? 'selected' : ''}>Created by (Read-only)</option>
                    <option value="last_edited_time" ${mapping.targetFieldNotionType === 'last_edited_time' ? 'selected' : ''}>Last edited time (Read-only)</option>
                    <option value="last_edited_by" ${mapping.targetFieldNotionType === 'last_edited_by' ? 'selected' : ''}>Last edited by (Read-only)</option>
                </select>
            </div>
            ${editable ? '<button type="button" class="btn btn-danger btn-small remove-field-mapping-button">Eliminar Campo</button>' : ''}
            <hr>
        `;
        fieldMappingsContainer.appendChild(mappingDiv);

        // Añadir event listener al botón de eliminar si es editable
        if (editable) {
            mappingDiv.querySelector('.remove-field-mapping-button').addEventListener('click', () => {
                mappingDiv.remove();
            });
        }
    }

    if (templateForm) {
        templateForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const templateId = document.getElementById('template-id').value;
            const template = {
                id: templateId || `tpl_${Date.now()}`,
                name: document.getElementById('template-name').value,
                sourcePlatform: document.getElementById('template-source-platform').value,
                targetPlatform: document.getElementById('template-target-platform').value,
                targetDetails: {},
                fieldMappings: []
            };

            if (template.targetPlatform === 'notion') {
                template.targetDetails.notionDatabaseId = document.getElementById('notion-database-id').value;
            }
            // Añadir lógica para otros targetDetails

            const mappingItems = fieldMappingsContainer.querySelectorAll('.field-mapping-item');
            mappingItems.forEach(item => {
                template.fieldMappings.push({
                    sourceFieldName: item.querySelector('.sourceFieldName').value,
                    sourceSelector: item.querySelector('.sourceSelector').value,
                    sourceAttribute: item.querySelector('.sourceAttribute').value,
                    targetFieldId: item.querySelector('.targetFieldId').value,
                    targetFieldNotionType: item.querySelector('.targetFieldNotionType').value,
                });
            });

            try {
                const data = await chrome.storage.sync.get({templates: []});
                let templates = data.templates;
                if (templateId) { // Editando plantilla existente
                    templates = templates.map(t => t.id === templateId ? template : t);
                } else { // Creando nueva plantilla
                    templates.push(template);
                }
                await chrome.storage.sync.set({ templates });
                showOptionsStatus('Plantilla guardada exitosamente.', 'success');
                loadTemplates();
                closeEditor();
            } catch (error) {
                console.error("Error al guardar plantilla:", error);
                showOptionsStatus(`Error al guardar plantilla: ${error.message}`, 'error');
            }
        });
    }
    
    async function loadTemplates() {
        try {
            const data = await chrome.storage.sync.get({templates: []});
            templateListContainer.innerHTML = ''; // Limpiar lista
            if (data.templates.length === 0) {
                templateListContainer.innerHTML = '<p>No hay plantillas creadas todavía.</p>';
                return;
            }

            const ul = document.createElement('ul');
            ul.className = 'template-list';
            data.templates.forEach(template => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span class="template-name">${template.name}</span>
                    <div class="template-actions">
                        <button class="btn btn-small btn-edit-template" data-id="${template.id}">Editar</button>
                        <button class="btn btn-small btn-danger btn-delete-template" data-id="${template.id}">Eliminar</button>
                    </div>
                `;
                ul.appendChild(li);
            });
            templateListContainer.appendChild(ul);

            document.querySelectorAll('.btn-edit-template').forEach(button => {
                button.addEventListener('click', (e) => editTemplate(e.target.dataset.id));
            });
            document.querySelectorAll('.btn-delete-template').forEach(button => {
                button.addEventListener('click', (e) => deleteTemplate(e.target.dataset.id));
            });

        } catch (error) {
            console.error("Error al cargar plantillas:", error);
            templateListContainer.innerHTML = '<p>Error al cargar plantillas.</p>';
        }
    }

    async function editTemplate(templateId) {
        try {
            const data = await chrome.storage.sync.get({templates: []});
            const template = data.templates.find(t => t.id === templateId);
            if (!template) {
                showOptionsStatus('Plantilla no encontrada.', 'error');
                return;
            }

            document.getElementById('template-editor-title').textContent = 'Editar Plantilla';
            document.getElementById('template-id').value = template.id;
            document.getElementById('template-name').value = template.name;
            document.getElementById('template-source-platform').value = template.sourcePlatform;
            document.getElementById('template-target-platform').value = template.targetPlatform;
            
            updateTargetDetailsVisibility(); // Asegura que se muestren los detalles correctos
            if (template.targetPlatform === 'notion' && template.targetDetails) {
                document.getElementById('notion-database-id').value = template.targetDetails.notionDatabaseId || '';
            }

            fieldMappingsContainer.innerHTML = '';
            template.fieldMappings.forEach(mapping => addFieldMapping(mapping, true));
            
            templateEditorModal.style.display = 'block';
        } catch (error) {
            console.error("Error al editar plantilla:", error);
            showOptionsStatus(`Error al editar plantilla: ${error.message}`, 'error');
        }
    }

    async function deleteTemplate(templateId) {
        if (!confirm('¿Estás seguro de que quieres eliminar esta plantilla?')) return;
        try {
            const data = await chrome.storage.sync.get({templates: []});
            const updatedTemplates = data.templates.filter(t => t.id !== templateId);
            await chrome.storage.sync.set({ templates: updatedTemplates });
            showOptionsStatus('Plantilla eliminada exitosamente.', 'success');
            loadTemplates();
        } catch (error) {
            console.error("Error al eliminar plantilla:", error);
            showOptionsStatus(`Error al eliminar plantilla: ${error.message}`, 'error');
        }
    }

    if (fetchNotionDatabasesButton) {
        fetchNotionDatabasesButton.addEventListener('click', async () => {
            showOptionsStatus('Obteniendo bases de datos de Notion...', 'processing');
            chrome.runtime.sendMessage({ action: "fetchNotionDatabases" }, response => {
                if (chrome.runtime.lastError) {
                    console.error("Error al obtener bases de datos:", chrome.runtime.lastError.message);
                    showOptionsStatus(`Error: ${chrome.runtime.lastError.message}`, 'error');
                    return;
                }
                if (response && response.success && response.databases) {
                    notionDatabaseSelect.innerHTML = '<option value="">Selecciona una base de datos</option>';
                    response.databases.forEach(db => {
                        const option = document.createElement('option');
                        option.value = db.id;
                        option.textContent = db.title;
                        notionDatabaseSelect.appendChild(option);
                    });
                    notionDatabaseSelect.style.display = 'block';
                    showOptionsStatus('Bases de datos cargadas.', 'success');
                } else {
                    showOptionsStatus(response.message || 'No se pudieron obtener las bases de datos.', 'error');
                    notionDatabaseSelect.style.display = 'none';
                }
            });
        });
    }
    
    if (notionDatabaseSelect) {
        notionDatabaseSelect.addEventListener('change', (event) => {
            document.getElementById('notion-database-id').value = event.target.value;
        });
    }


    // Lógica para Compartir Configuración
    const exportConfigButton = document.getElementById('export-config-button');
    const importConfigInput = document.getElementById('import-config-input');

    if (exportConfigButton) {
        exportConfigButton.addEventListener('click', async () => {
            try {
                const dataToExport = await chrome.storage.sync.get(['templates', 'userPreferences']); // Ajustar según lo que se quiera exportar
                // EXCLUIR explícitamente tokens o datos sensibles.
                // notionConnection NO debería exportarse.
                const configJson = JSON.stringify(dataToExport, null, 2);
                const blob = new Blob([configJson], {type: 'application/json'});
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `configuracion_extractor_datos_${new Date().toISOString().slice(0,10)}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                showOptionsStatus('Configuración exportada.', 'success');
            } catch (error) {
                console.error("Error al exportar configuración:", error);
                showOptionsStatus(`Error al exportar: ${error.message}`, 'error');
            }
        });
    }

    if (importConfigInput) {
        importConfigInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const importedConfig = JSON.parse(e.target.result);
                        // Validar la estructura del JSON importado aquí
                        if (importedConfig.templates !== undefined) { // Podría haber más validaciones
                            // Preguntar al usuario si desea fusionar o reemplazar
                            if (confirm("¿Deseas reemplazar tus plantillas actuales con las importadas? Cancelar para intentar fusionar (no implementado aún).")) {
                                await chrome.storage.sync.set({ templates: importedConfig.templates || [] });
                                // Importar otras configuraciones si existen y son seguras
                                showOptionsStatus('Configuración importada y plantillas reemplazadas.', 'success');
                                loadTemplates(); // Recargar la lista de plantillas
                            } else {
                                // Lógica de fusión (más compleja, para una futura iteración)
                                showOptionsStatus('Importación cancelada. Fusión no implementada.', 'info');
                            }
                        } else {
                            showOptionsStatus('Archivo de configuración no válido.', 'error');
                        }
                    } catch (error) {
                        console.error("Error al importar configuración:", error);
                        showOptionsStatus(`Error al importar: ${error.message}`, 'error');
                    } finally {
                        importConfigInput.value = ''; // Resetear el input
                    }
                };
                reader.readAsText(file);
            }
        });
    }

    // Cargar estado inicial al abrir la página de opciones
    updateNotionConnectionStatus();
    loadTemplates();
    updateTargetDetailsVisibility(); // Para el editor de plantillas

    // Escuchar mensajes del background script (por ejemplo, actualizaciones de estado de conexión)
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        if (request.action === "notionConnectionUpdate") {
            updateNotionConnectionStatus();
            if (request.success) {
                showOptionsStatus(request.message || "Estado de Notion actualizado.", 'success');
            } else {
                showOptionsStatus(request.message || "Error al actualizar estado de Notion.", 'error');
            }
        }
        // Informar al popup para que también se actualice, si está abierto
        chrome.runtime.sendMessage({ action: "updatePopupStatus" }).catch(e => console.debug("Popup no abierto o error:", e));
    });

    function showOptionsStatus(message, type = 'info') {
        const statusElement = document.getElementById('status-message-options');
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.className = `status-message status-${type}`; // Asegúrate de tener clases CSS para status-success, status-error, etc.
            statusElement.style.display = 'block';
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000); // Ocultar después de 5 segundos
        }
        console.log(`Options Status (${type}): ${message}`);
    }

});
