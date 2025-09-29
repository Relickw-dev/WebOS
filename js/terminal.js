// File: js/terminal.js
import { syscall } from './kernel/syscalls.js';
import { on } from './kernel/core.js';

let terminalOutput;
let terminalInput;
let currentLine;
let commandHistory = [];
let historyIndex = -1;
let currentDirectory = '/';

const commandLogicPaths = {
    'ls': '/js/procs/ls.js',
    'cat': '/js/procs/cat.js',
    'echo': '/js/procs/echo.js',
    'mkdir': '/js/procs/mkdir.js',
    'touch': '/js/procs/touch.js',
    'ps': '/js/procs/ps.js',
    'rm': '/js/procs/rm.js',
    'cp': '/js/procs/cp.js',
    'mv': '/js/procs/mv.js',
    'pwd': '/js/procs/pwd.js',
    'clear': '/js/procs/clear.js',
    'help': '/js/procs/help.js',
};

// **Schimbare crucială: Inițializare autonomă**
// Codul va aștepta automat ca DOM-ul să fie gata înainte de a se rula.
window.addEventListener('DOMContentLoaded', () => {
    terminalOutput = document.getElementById('terminal-output');
    terminalInput = document.getElementById('terminal-input');
    currentLine = document.getElementById('current-line');
    
    // Verifică dacă elementele au fost găsite
    if (terminalOutput && terminalInput && currentLine) {
        terminalInput.addEventListener('keydown', handleInput);
        document.querySelector('.terminal').addEventListener('click', () => terminalInput.focus());

        setupTerminalSyscallHandlers();
        
        updatePrompt();
        terminalInput.focus();
    } else {
        console.error('Error: Terminal elements not found in the DOM.');
    }
});

function setupTerminalSyscallHandlers() {
    on('terminal.clear', (params, resolve) => {
        terminalOutput.innerHTML = '';
        resolve();
    });

    on('terminal.getCwd', (params, resolve) => {
        resolve(currentDirectory);
    });

    on('terminal.getCommands', (params, resolve) => {
        resolve(commandLogicPaths);
    });
}

function updatePrompt() {
    document.getElementById('prompt').textContent = `user@webos:${currentDirectory}$`;
}

function logToTerminal(message, isCommand = false) {
    const element = document.createElement('div');
    if (typeof message === 'object' && message.type === 'error') {
        element.innerHTML = `<span class="error">${message.message.replace(/\n/g, '<br>')}</span>`;
    } else {
        element.textContent = message;
    }

    if (isCommand) {
        element.innerHTML = `<span class="prompt">${document.getElementById('prompt').textContent}</span> ${message}`;
    }
    
    terminalOutput.appendChild(element);
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

function handleInput(e) {
    if (e.key === 'Enter') {
        e.preventDefault();
        const command = terminalInput.value.trim();
        logToTerminal(command, true);
        
        if (command) {
            commandHistory.unshift(command);
            historyIndex = -1;
            executeCommand(command);
        } else {
            newPromptLine();
        }
        
        terminalInput.value = '';
    } else if (e.key === 'ArrowUp') {
        if (historyIndex < commandHistory.length - 1) {
            historyIndex++;
            terminalInput.value = commandHistory[historyIndex];
        }
    } else if (e.key === 'ArrowDown') {
        if (historyIndex > 0) {
            historyIndex--;
            terminalInput.value = commandHistory[historyIndex];
        } else {
            historyIndex = -1;
            terminalInput.value = '';
        }
    }
}

function newPromptLine() {
    updatePrompt();
    currentLine.style.display = 'flex';
    terminalInput.focus();
    terminalOutput.scrollTop = terminalOutput.scrollHeight;
}

async function executeCommand(commandString) {
    currentLine.style.display = 'none';

    try {
        const pipeline = parseCommand(commandString);
        if (pipeline.length === 0) {
            newPromptLine();
            return;
        }
        
        for (const stage of pipeline) {
            if (!commandLogicPaths[stage.name]) {
                throw new Error(`Command not found: ${stage.name}`);
            }
            stage.logicPath = commandLogicPaths[stage.name];
        }
        
        await syscall('proc.pipeline', {
            pipeline,
            onOutput: (data) => logToTerminal(data),
            onDone: (exitCode) => {
                newPromptLine();
            }
        });
        
    } catch (e) {
        logToTerminal({ type: 'error', message: e.message });
        newPromptLine();
    }
}

function parseCommand(input) {
    return input.split('|').map(part => {
        const tokens = part.trim().split(/\s+/).filter(Boolean);
        if (tokens.length === 0) return null;
        return {
            name: tokens[0],
            args: tokens.slice(1),
        };
    }).filter(Boolean);
}