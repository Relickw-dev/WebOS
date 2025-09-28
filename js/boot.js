// js/boot.js

// --- ELEMENTE DOM ---
const container = document.getElementById('container');
const output = document.getElementById('terminal-output');
const input = document.getElementById('terminal-input');
const promptElement = document.getElementById('prompt');

// --- STAREA TERMINALULUI ---
const commandHistory = [];
let historyIndex = -1;
let currentPath = '.'; // Acum calea este relativă la rădăcina proiectului

// --- LISTA DE COMENZI PENTRU AUTO-COMPLETARE ---
const availableCommands = ['help', 'clear', 'echo', 'date', 'ls', 'cat']; // Am scos cd și mkdir momentan

// --- FUNCȚII UTILITARE ---
function logToTerminal(message) {
    output.innerHTML += `<p>${message}</p>`;
    output.scrollTop = output.scrollHeight;
}

function updatePrompt() {
    promptElement.textContent = `user@webos:${currentPath}$`;
}

// --- LOGICA COMENZILOR ---
const commands = {
    help: () => logToTerminal(`Available commands: ${availableCommands.join(', ')}`),
    clear: () => output.innerHTML = '',
    echo: args => logToTerminal(args.join(' ')),
    date: () => logToTerminal(new Date().toLocaleString()),

    // Comanda 'ls' modificată
    ls: async (args) => {
        const path = args[0] || currentPath;
        try {
            // Trimite cerere la server
            const response = await fetch(`http://localhost:3000/api/files?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            
            logToTerminal(data.join('  '));
        } catch (error) {
            logToTerminal(error.message);
        }
    },

    // Comanda 'cat' modificată
    cat: async (args) => {
        const path = args[0];
        if (!path) {
            logToTerminal('cat: missing operand');
            return;
        }
        try {
            // Trimite cerere la server
            const response = await fetch(`http://localhost:3000/api/cat?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);

            logToTerminal(data.content);
        } catch (error) {
            logToTerminal(error.message);
        }
    }
};

async function processCommand(commandStr) {
    commandHistory.unshift(commandStr);
    historyIndex = -1;
    logToTerminal(`${promptElement.textContent} ${commandStr}`);

    const [cmd, ...args] = commandStr.trim().split(' ');
    if (commands[cmd]) {
        // Folosim await pentru comenzile care comunică cu serverul
        await commands[cmd](args);
    } else {
        logToTerminal(`Command not found: ${cmd}.`);
    }
    updatePrompt(); // Actualizăm promptul după fiecare comandă
}

// --- EVENT LISTENERS (Rămân la fel) ---
container.addEventListener('click', () => input.focus());

input.addEventListener('keydown', async (e) => { // Funcția devine async
    if (e.key === 'Enter') {
        const command = input.value.trim();
        if (command) {
            await processCommand(command);
        }
        input.value = '';
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            input.value = commandHistory[historyIndex];
        }
    } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) {
            historyIndex--;
            input.value = commandHistory[historyIndex];
        } else {
            historyIndex = -1;
            input.value = '';
        }
    } else if (e.key === 'Tab') {
        // Logica de autocomplete rămâne la fel
        e.preventDefault();
        const partialCmd = input.value.split(' ')[0];
        const matches = availableCommands.filter(c => c.startsWith(partialCmd));
        if (matches.length === 1) {
            input.value = matches[0];
        } else if (matches.length > 1) {
            logToTerminal(`${promptElement.textContent} ${input.value}`);
            logToTerminal(matches.join('  '));
        }
    }
});

// --- INIȚIALIZARE ---
logToTerminal('WebOS Terminal v3.0 (Server-Connected). Type "help".');
updatePrompt();
input.focus();