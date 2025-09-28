// js/desktop.js
import { Window } from './Window.js';

// Funcția principală care construiește și pornește interfața grafică
export function initializeDesktop() {
    // Golește container-ul principal și elimină terminalul
    const container = document.getElementById('container');
    container.innerHTML = `
        <div id="desktop">
            <div class="icon" data-app="notepad">
                <span>Notepad</span>
            </div>
        </div>
        <div id="taskbar"></div>
    `;
    container.style.background = 'none'; // Resetează fundalul negru

    const desktop = document.getElementById('desktop');
    desktop.addEventListener('dblclick', (e) => {
        const icon = e.target.closest('[data-app]');
        if (icon) {
            launchApp(icon.dataset.app);
        }
    });
}

// Funcția de lansare a aplicațiilor rămâne la fel
async function launchApp(appName) {
    try {
        const appModule = await import(`../apps/${appName}.js`);
        const appContent = appModule.launch();
        const appTitle = appModule.title || 'Untitled';
        new Window(appTitle, appContent);
    } catch (error) {
        console.error(`Failed to launch app: ${appName}`, error);
        alert(`Error: Could not load application '${appName}'.`);
    }
}