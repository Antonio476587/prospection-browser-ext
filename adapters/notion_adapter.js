// utils/utils.js
// Este archivo puede contener funciones de utilidad compartidas por diferentes partes de la extensión.

/**
 * Muestra un mensaje de estado.
 * @param {string} message - El mensaje a mostrar.
 * @param {string} type - El tipo de mensaje ('success', 'error', 'info', 'processing').
 * @param {HTMLElement} statusElement - El elemento HTML donde mostrar el mensaje.
 */
function showStatusMessage(message, type, statusElement) {
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.className = `status-message status-${type}`; // Asegúrate de tener clases CSS
        statusElement.style.display = 'block';
        
        if (type !== 'processing') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 5000); // Ocultar después de 5 segundos
        }
    }
    console.log(`Status (${type}): ${message}`);
}

/**
 * Valida un objeto de plantilla.
 * @param {object} template - El objeto de plantilla a validar.
 * @returns {boolean} - True si la plantilla es válida, false en caso contrario.
 */
function isValidTemplate(template) {
    if (!template || typeof template !== 'object') return false;
    if (!template.id || typeof template.id !== 'string') return false;
    if (!template.name || typeof template.name !== 'string') return false;
    if (!['linkedin', 'instagram'].includes(template.sourcePlatform)) return false; // Ampliar según sea necesario
    if (!['notion'].includes(template.targetPlatform)) return false; // Ampliar según sea necesario
    if (!template.fieldMappings || !Array.isArray(template.fieldMappings)) return false;

    for (const mapping of template.fieldMappings) {
        if (!mapping.sourceFieldName || typeof mapping.sourceFieldName !== 'string') return false;
        if (!mapping.sourceSelector || typeof mapping.sourceSelector !== 'string') return false;
        // ... más validaciones para cada campo del mapeo
    }
    return true;
}


// Otras funciones de utilidad:
// - Funciones para interactuar con chrome.storage de forma más abstracta.
// - Funciones de formateo de datos.
// - Funciones para la UI (si se comparten entre popup y options, aunque es mejor mantenerlos separados).

// Ejemplo: Funciones de utilidad para IOutputAdapter (como se mencionó en el plan)
// Estas podrían ser usadas por los adaptadores para interactuar con la UI de la extensión
// de una manera estandarizada, por ejemplo, para solicitar al usuario que complete un paso de OAuth.
const uiUtils = {
    /**
     * Solicita al usuario que complete un flujo de autenticación.
     * Podría abrir una nueva pestaña o mostrar un modal dentro de la página de opciones.
     * @param {string} authUrl - La URL para iniciar la autenticación.
     * @returns {Promise<string>} - Promesa que resuelve con la URL de redirección o rechaza con error.
     */
    promptUserForAuth: (authUrl) => {
        return new Promise((resolve, reject) => {
            // Esto es un ejemplo. En una implementación real, esto podría ser más complejo,
            // quizás enviando un mensaje al background script para usar chrome.identity.launchWebAuthFlow
            // o abriendo la URL directamente si es seguro hacerlo.
            try {
                // Para una extensión, es mejor usar chrome.identity.launchWebAuthFlow
                // Esta función es un placeholder conceptual.
                console.warn("uiUtils.promptUserForAuth es un placeholder. La autenticación real debe usar chrome.identity.");
                // Simulación:
                // const newWindow = window.open(authUrl, '_blank', 'width=600,height=700');
                // if (!newWindow) {
                // reject(new Error("No se pudo abrir la ventana de autenticación. Revisa los bloqueadores de popups."));
                // } else {
                //     // Aquí necesitarías una forma de detectar la redirección.
                //     // Esto es muy complejo de hacer directamente sin chrome.identity.
                // }
                reject(new Error("Función de UI para Auth no implementada completamente. Usar chrome.identity."));
            } catch (error) {
                reject(error);
            }
        });
    },

    /**
     * Muestra un mensaje al usuario.
     * @param {string} message - El mensaje a mostrar.
     * @param {'info'|'success'|'error'} type - El tipo de mensaje.
     */
    showMessage: (message, type = 'info') => {
        // Podría enviar un mensaje a la página de opciones o al popup para mostrar el mensaje.
        // O usar chrome.notifications.
        chrome.notifications.create({
            type: 'basic',
            iconUrl: '../icons/icon48.png', // Asegúrate que esta ruta sea correcta desde el contexto del service worker
            title: `Notificación de Extensión (${type})`,
            message: message
        });
    }
};

// Exportar funciones si se usa un sistema de módulos (no es estándar en service workers de extensión sin empaquetadores)
// En el contexto de una extensión, estas funciones estarían disponibles globalmente si este script se carga,
// o podrías cargarlas selectivamente donde se necesiten.
