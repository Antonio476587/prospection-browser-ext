// content/content_scraper.js
console.log("Script de contenido (content_scraper.js) cargado.");

let selectionModeActive = false;
let highlightedElement = null;

// Función para resaltar elementos
function highlightElement(event) {
    if (highlightedElement) {
        highlightedElement.style.outline = ''; // Quitar resaltado anterior
    }
    highlightedElement = event.target;
    highlightedElement.style.outline = '2px dashed red'; // Resaltar actual
}

// Función para quitar resaltado
function removeHighlight() {
    if (highlightedElement) {
        highlightedElement.style.outline = '';
        highlightedElement = null;
    }
}

// Función para manejar el clic en modo selección
function handleElementSelection(event) {
    if (selectionModeActive && highlightedElement) {
        event.preventDefault();
        event.stopPropagation();

        const selector = generateRobustSelector(highlightedElement);
        const textContent = highlightedElement.textContent.trim();
        const elementType = highlightedElement.tagName.toLowerCase();
        
        console.log('Elemento seleccionado:', highlightedElement);
        console.log('Selector generado:', selector);
        console.log('Contenido de texto:', textContent);

        // Aquí podrías enviar el selector al popup/options page o guardarlo temporalmente
        // Por ahora, lo mostramos en consola y desactivamos el modo.
        alert(`Elemento Seleccionado!\nTag: ${elementType}\nSelector (consola): ${selector}\nTexto: ${textContent.substring(0,50)}...`);
        
        // Enviar datos al popup o a la página de opciones (a través del background script)
        // chrome.runtime.sendMessage({
        // action: "elementSelected",
        // selector: selector,
        // text: textContent,
        // elementType: elementType
        // });

        deactivateSelectionMode();
    }
}

// Función para generar un selector CSS robusto (simplificado)
function generateRobustSelector(element) {
    if (element.id) {
        return `#${element.id}`;
    }
    let path = [];
    while (element.parentNode) {
        let sibling = element;
        let nth = 1;
        while (sibling.previousElementSibling) {
            sibling = sibling.previousElementSibling;
            if (sibling.tagName === element.tagName) {
                nth++;
            }
        }
        let tag = element.tagName.toLowerCase();
        let selector = `${tag}:nth-of-type(${nth})`;
        
        // Intentar añadir clases si son útiles y no muy genéricas
        constclassList = Array.from(element.classList)
            .filter(cls => !/^[0-9]/.test(cls) && cls.length > 2 && !/(active|selected|open|focus|hover)/i.test(cls)); // Evitar clases de estado comunes
        if (classList.length > 0 && classList.length <= 2) { // Limitar número de clases para no hacer el selector demasiado largo
            selector = `${tag}.${classList.join('.')}`;
        }
        
        path.unshift(selector);
        element = element.parentNode;
        if (element.nodeType !== Node.ELEMENT_NODE) break; // Salir si llegamos al document
    }
    return path.join(' > ');
}


function activateSelectionMode() {
    if (selectionModeActive) return;
    selectionModeActive = true;
    document.body.style.cursor = 'crosshair';
    document.addEventListener('mouseover', highlightElement);
    document.addEventListener('mouseout', removeHighlight);
    document.addEventListener('click', handleElementSelection, true); // Captura en fase de captura
    console.log('Modo de selección de elementos ACTIVADO.');
    // Podrías mostrar un banner o notificación en la página
}

function deactivateSelectionMode() {
    if (!selectionModeActive) return;
    selectionModeActive = false;
    document.body.style.cursor = 'default';
    removeHighlight();
    document.removeEventListener('mouseover', highlightElement);
    document.removeEventListener('mouseout', removeHighlight);
    document.removeEventListener('click', handleElementSelection, true);
    console.log('Modo de selección de elementos DESACTIVADO.');
}


// Escuchar mensajes desde el popup o background script
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log('Mensaje recibido en content_scraper.js:', request);

    if (request.action === "extractDataFromPage") {
        // Lógica para extraer datos basada en la plantilla (request.template)
        // Esto es un marcador de posición. La lógica real será compleja.
        console.log("Extrayendo datos con plantilla:", request.template);
        const extractedData = {};
        let allFieldsFound = true;

        try {
            request.template.fieldMappings.forEach(mapping => {
                const element = document.querySelector(mapping.sourceSelector);
                if (element) {
                    let value = '';
                    switch (mapping.sourceAttribute) {
                        case 'textContent':
                            value = element.textContent;
                            break;
                        case 'innerHTML':
                            value = element.innerHTML;
                            break;
                        case 'href':
                            value = element.href;
                            break;
                        case 'src':
                            value = element.src;
                            break;
                        default:
                            value = element.getAttribute(mapping.sourceAttribute);
                    }
                    extractedData[mapping.sourceFieldName] = value ? value.trim() : '';
                } else {
                    console.warn(`Elemento no encontrado para selector: ${mapping.sourceSelector} (Campo: ${mapping.sourceFieldName})`);
                    extractedData[mapping.sourceFieldName] = null; // O un valor por defecto
                    // allFieldsFound = false; // Podrías querer manejar esto
                }
            });
            
            // Aquí se aplicarían transformaciones si estuvieran definidas en la plantilla
            
            sendResponse({ success: true, data: extractedData });

        } catch (error) {
            console.error("Error al extraer datos en content script:", error);
            sendResponse({ success: false, message: `Error de extracción: ${error.message}` });
        }
        return true; // Indicar que la respuesta es asíncrona si hay operaciones asíncronas dentro
    }
    else if (request.action === "activateElementSelectionMode") {
        activateSelectionMode();
        sendResponse({status: "activated"});
        return true;
    }
    // Otros manejadores de mensajes...
});

// Ejemplo de cómo podrías manejar contenido dinámico (MutationObserver)
// Esta es una implementación muy básica y necesitaría ser adaptada.
/*
const observer = new MutationObserver((mutationsList, observer) => {
    for(const mutation of mutationsList) {
        if (mutation.type === 'childList') {
            console.log('Un nodo hijo ha sido añadido o eliminado.');
            // Aquí podrías re-evaluar selectores o buscar nuevos datos
            // si la extracción está activa o pendiente.
        }
        else if (mutation.type === 'attributes') {
            console.log(`El atributo '${mutation.attributeName}' ha sido modificado.`);
        }
    }
});
*/
// Para observar cambios en el cuerpo del documento:
// observer.observe(document.body, { attributes: true, childList: true, subtree: true });

// Recuerda desconectar el observer cuando ya no sea necesario:
// observer.disconnect();

// Consideraciones Anti-Extracción:
// 1. Evitar peticiones demasiado rápidas o patrones de bot.
// 2. Usar selectores robustos que no dependan de clases generadas dinámicamente.
// 3. Considerar retrasos aleatorios si se realizan acciones automatizadas (con mucha cautela).
// 4. La extracción iniciada por el usuario es generalmente más segura.
