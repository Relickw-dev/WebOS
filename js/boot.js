// js/boot.js

const output = document.getElementById('terminal-output');
const input = document.getElementById('terminal-input');

function logToTerminal(message) {
    output.innerHTML += `<p>${message}</p>`;
    // Scroll automat la ultimul mesaj
    output.scrollTop = output.scrollHeight;
}

// Procesează comenzile
async function processCommand(command) {
    logToTerminal(`> ${command}`); // Afișează comanda tastată
    const [cmd, ...args] = command.toLowerCase().split(' ');

    switch (cmd) {
        case 'help':
            logToTerminal('Available commands: help, clear, boot');
            break;
        case 'clear':
            output.innerHTML = '';
            break;
        case 'boot':
            await startBootSequence();
            break;
        default:
            logToTerminal(`Command not found: ${cmd}`);
            break;
    }
}

// Simulează secvența de boot
async function startBootSequence() {
    logToTerminal('Checking for system image...');
    try {
        // 1. Verificăm dacă "imaginea" (desktop.js) există
        const response = await fetch('./js/desktop.js');
        if (!response.ok) {
            throw new Error('Image not found.');
        }

        logToTerminal('System image found. Booting WebOS...');
        
        // Așteptăm puțin pentru efect dramatic
        await new Promise(resolve => setTimeout(resolve, 1500));

        // 2. Importăm dinamic modul desktop
        const desktopModule = await import('./desktop.js');
        
        // 3. Inițializăm desktop-ul
        desktopModule.initializeDesktop();

    } catch (error) {
        logToTerminal('Boot Error: Operating System not found.');
        console.error(error);
    }
}

// Adaugă event listener pentru tasta Enter
input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        const command = input.value.trim();
        if (command) {
            processCommand(command);
        }
        input.value = '';
    }
});

logToTerminal('BIOS v1.0 Loaded. Type "help" for a list of commands.');