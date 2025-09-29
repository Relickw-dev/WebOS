// File: js/terminal.js
import { on, exec } from './kernel/core.js'; // Schimbare: Am importat 'exec'

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
    
    // Asigurăm că 'message' este un string înainte de a-l procesa
    const messageString = (typeof message === 'object' && message.message) ? message.message : String(message);
    
    // Înlocuim toate aparițiile de '\n' cu tag-ul HTML '<br>' pentru a forța un salt la linie nouă.
    const formattedMessage = messageString.replace(/\n/g, '<br>');

    if (typeof message === 'object' && message.type === 'error') {
        element.innerHTML = `<span class="error">${formattedMessage}</span>`;
    } else if (isCommand) {
        element.innerHTML = `<span class="prompt">${document.getElementById('prompt').textContent}</span> ${formattedMessage}`;
    } else {
        // Folosim innerHTML și pentru output-ul normal
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

        // --- MODIFICARE CHEIE ---
        // Verificăm dacă ultima comandă din pipeline are o redirectare.
        const lastStage = pipeline[pipeline.length - 1];
        let onStdout = (data) => logToTerminal(data); // Default: afișează pe ecran

        if (lastStage.redirect) {
            const { op, file } = lastStage.redirect;
            if (!file) {
                throw new Error('Syntax error: No file specified for redirection.');
            }
            
            // Creăm un nou handler pentru stdout care scrie în fișier.
            onStdout = async (data) => {
                const content = (typeof data === 'string' ? data : JSON.stringify(data)) + '\n';
                await exec([{
                    name: 'touch', // Folosim logica existentă din `touch` pentru a scrie
                    logicPath: commandLogicPaths['touch'],
                    args: [file, content, op === '>>'] // [path, content, append]
                }]);
            };
        }
        
        // Atribuim fiecărei comenzi calea către logica sa.
        for (const stage of pipeline) {
            if (!commandLogicPaths[stage.name]) {
                throw new Error(`Command not found: ${stage.name}`);
            }
            stage.logicPath = commandLogicPaths[stage.name];
        }
        
        await exec(pipeline, onStdout, () => newPromptLine());
        
    } catch (e) {
        logToTerminal({ type: 'error', message: e.message });
        newPromptLine();
    }
}

function parseCommand(input) {
    const stages = input.split('|').map(part => part.trim());
    const pipeline = [];

    for (const stageString of stages) {
        // Găsim operatorii de redirectare și fișierul
        const redirectMatch = stageString.match(/(>>?)\s*(\S+)$/);
        let argsString = stageString;
        let redirect = null;

        if (redirectMatch) {
            redirect = {
                op: redirectMatch[1],       // '>>' sau '>'
                file: redirectMatch[2]       // numele fișierului
            };
            // Eliminăm redirectarea din string-ul de argumente
            argsString = stageString.substring(0, redirectMatch.index).trim();
        }

        const tokens = argsString.match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
        if (tokens.length === 0) continue;

        const command = {
            name: tokens[0].replace(/["']/g, ''),
            args: tokens.slice(1).map(arg => arg.replace(/["']/g, '')),
            redirect: redirect // Adăugăm informațiile de redirectare
        };
        pipeline.push(command);
    }
    
    // Doar ultima comandă poate avea redirectare de output
    for(let i = 0; i < pipeline.length - 1; i++) {
        if (pipeline[i].redirect) {
            throw new Error("Syntax error: Redirection is only allowed for the final command in a pipeline.");
        }
    }

    return pipeline;
}