// js/boot.js

const container = document.getElementById('container');
const output = document.getElementById('terminal-output');
const input = document.getElementById('terminal-input');
const promptElement = document.getElementById('prompt');

const commandHistory = [];
let historyIndex = -1;
let currentPath = '.';

// Adăugăm noile comenzi
const availableCommands = ['help', 'clear', 'echo', 'date', 'ls', 'cat', 'cd', 'mkdir', 'touch', 'rm', 'mv'];

function logToTerminal(message) {
    output.innerHTML += `<p>${message}</p>`;
    output.scrollTop = output.scrollHeight;
}

function updatePrompt() {
    const displayPath = currentPath === '.' ? '~' : `~/${currentPath}`;
    promptElement.textContent = `user@webos:${displayPath}$`;
}

function resolveClientPath(targetPath) {
    if (targetPath.startsWith('/')) {
        return targetPath.substring(1) || '.';
    }
    const pathParts = currentPath === '.' ? [] : currentPath.split('/');
    const targetParts = targetPath.split('/').filter(p => p);
    for (const part of targetParts) {
        if (part === '..') {
            pathParts.pop();
        } else if (part !== '.') {
            pathParts.push(part);
        }
    }
    let newPath = pathParts.join('/');
    return newPath === '' ? '.' : newPath;
}

const commands = {
    help: () => logToTerminal(`Available commands: ${availableCommands.join(', ')}`),
    clear: () => output.innerHTML = '',
    echo: args => logToTerminal(args.join(' ')),
    date: () => logToTerminal(new Date().toLocaleString()),

    ls: async (args) => {
        const path = args[0] ? resolveClientPath(args[0]) : currentPath;
        try {
            const response = await fetch(`http://localhost:3000/api/files?path=${encodeURIComponent(path)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            logToTerminal(data.join('  '));
        } catch (error) {
            logToTerminal(error.message);
        }
    },

    cat: async (args) => {
        const pathArg = args[0];
        if (!pathArg) return logToTerminal('cat: missing operand');
        const fullPath = resolveClientPath(pathArg);
        try {
            const response = await fetch(`http://localhost:3000/api/cat?path=${encodeURIComponent(fullPath)}`);
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            logToTerminal(data.content);
        } catch (error) {
            logToTerminal(error.message);
        }
    },

    cd: async (args) => {
        const targetPath = args[0] || '.';
        const newPath = resolveClientPath(targetPath);
        try {
            const response = await fetch('http://localhost:3000/api/checkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: newPath })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            currentPath = newPath;
        } catch (error) {
            logToTerminal(error.message);
        }
    },

    mkdir: async (args) => {
        const dirName = args[0];
        if (!dirName) return logToTerminal('mkdir: missing operand');
        const fullPath = resolveClientPath(dirName);
        try {
            const response = await fetch('http://localhost:3000/api/mkdir', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: fullPath })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
        } catch (error) {
            logToTerminal(error.message);
        }
    },
    
    // --- COMANDA NOUĂ 'touch' ---
    touch: async (args) => {
        const fileName = args[0];
        if (!fileName) return logToTerminal('touch: missing file operand');
        const fullPath = resolveClientPath(fileName);
        try {
            const response = await fetch('http://localhost:3000/api/touch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: fullPath })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
        } catch (error) {
            logToTerminal(error.message);
        }
    },

    // --- COMANDA NOUĂ 'rm' ---
    rm: async (args) => {
        const targetPath = args[0];
        if (!targetPath) return logToTerminal('rm: missing operand');
        const fullPath = resolveClientPath(targetPath);
        try {
            const response = await fetch('http://localhost:3000/api/rm', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path: fullPath })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
        } catch (error) {
            logToTerminal(error.message);
        }
    },

    // --- COMANDA NOUĂ 'mv' ---
    mv: async (args) => {
        const [source, destination] = args;
        if (!source || !destination) return logToTerminal('mv: missing operand');
        
        const sourcePath = resolveClientPath(source);
        const destinationPath = resolveClientPath(destination);

        try {
            const response = await fetch('http://localhost:3000/api/mv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ source: sourcePath, destination: destinationPath })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
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
        await commands[cmd](args);
    } else {
        logToTerminal(`Command not found: ${cmd}.`);
    }
    updatePrompt();
}

// Event Listeners (neschimbate)
container.addEventListener('click', () => input.focus());
input.addEventListener('keydown', async (e) => {
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

// Inițializare
logToTerminal('WebOS Terminal v4.1 (File Ops Ready). Welcome!');
updatePrompt();
input.focus();