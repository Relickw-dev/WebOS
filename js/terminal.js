// File: js/terminal.js
import { on, exec } from './kernel/core.js';
import { syscall } from './kernel/syscalls.js';

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
    'cd': '/js/procs/cd.js'
};

export function initTerminal() {
    terminalOutput = document.getElementById('terminal-output');
    terminalInput = document.getElementById('terminal-input');
    currentLine = document.getElementById('current-line');
    
    if (terminalOutput && terminalInput && currentLine) {
        terminalInput.addEventListener('keydown', handleInput);
        document.getElementById('terminal').addEventListener('click', () => terminalInput.focus());

        setupTerminalSyscallHandlers();
        
        updatePrompt();
        terminalInput.focus();
    } else {
        console.error('Error: Terminal elements not found in the DOM.');
    }
}

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
    
    const messageString = (typeof message === 'object' && message.message) ? message.message : String(message);
    const formattedMessage = messageString.replace(/\n/g, '<br>');

    if (typeof message === 'object' && message.type === 'error') {
        element.innerHTML = `<span class="error">${formattedMessage}</span>`;
    } else if (isCommand) {
        element.innerHTML = `<span class="prompt">${document.getElementById('prompt').textContent}</span> ${formattedMessage}`;
    } else {
        element.innerHTML = formattedMessage;
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

        const lastStage = pipeline[pipeline.length - 1];
        let onStdout = (data) => logToTerminal(data);

        if (lastStage.redirect) {
            const { op, file } = lastStage.redirect;
            if (!file) {
                throw new Error('Syntax error: No file specified for redirection.');
            }
            
            onStdout = async (data) => {
                const content = typeof data === 'string' ? data : JSON.stringify(data);
                if (content) {
                    await syscall('vfs.write', {
                        path: file,
                        content: content,
                        append: op === '>>'
                    });
                }
            };
        }
        
        for (const stage of pipeline) {
            if (!commandLogicPaths[stage.name]) {
                throw new Error(`Command not found: ${stage.name}`);
            }
            stage.logicPath = commandLogicPaths[stage.name];
        }
        
        // --- ÎNCEPUT MODIFICĂRI ---
        
        // Definim un callback care inspectează codul de ieșire.
        const onDoneCallback = (exitCode) => {
            // Verificăm dacă exitCode este un obiect și are cheia 'new_cwd'.
            if (typeof exitCode === 'object' && exitCode !== null && exitCode.new_cwd) {
                currentDirectory = exitCode.new_cwd;
            }
            // Indiferent de rezultat, afișăm prompt-ul nou.
            newPromptLine();
        };

        // Apelăm exec pasând callback-ul și directorul curent.
        await exec(pipeline, onStdout, onDoneCallback, currentDirectory);
        
        // --- SFÂRȘIT MODIFICĂRI ---
        
    } catch (e) {
        logToTerminal({ type: 'error', message: e.message });
        newPromptLine();
    }
}

function parseCommand(input) {
    const stages = input.split('|').map(part => part.trim());
    const pipeline = [];

    for (const stageString of stages) {
        const redirectMatch = stageString.match(/(>>?)\s*(\S+)$/);
        let argsString = stageString;
        let redirect = null;

        if (redirectMatch) {
            redirect = {
                op: redirectMatch[1],
                file: redirectMatch[2]
            };
            argsString = stageString.substring(0, redirectMatch.index).trim();
        }

        const tokens = argsString.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        if (tokens.length === 0) continue;

        const command = {
            name: tokens[0].replace(/["']/g, ''),
            args: tokens.slice(1).map(arg => arg.replace(/["']/g, '')),
            redirect: redirect
        };
        pipeline.push(command);
    }
    
    for(let i = 0; i < pipeline.length - 1; i++) {
        if (pipeline[i].redirect) {
            throw new Error("Syntax error: Redirection is only allowed for the final command in a pipeline.");
        }
    }

    return pipeline;
}