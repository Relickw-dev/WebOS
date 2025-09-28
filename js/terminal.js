// js/terminal.js

import { kernel } from './kernel.js';

export function initializeTerminal() {
    const container = document.getElementById('container');
    const output = document.getElementById('terminal-output');
    const input = document.getElementById('terminal-input');
    const promptElement = document.getElementById('prompt');

    const commandHistory = [];
    let historyIndex = -1;
    let currentPath = '.';
    
    // --- SISTEM DE JOBURI ---
    let jobs = {}; // Tabela de joburi (procese din background)
    let nextJobId = 1;
    let isCommandRunning = false; // Blochează prompt-ul în timpul execuției foreground

    const availableCommands = [
        'help', 'clear', 'echo', 'date', 'ls', 'cat', 'cd', 'mkdir', 
        'touch', 'rm', 'mv', 'ps', 'grep', 'pwd', 'history', 'uname',
        'jobs', 'kill', 'sleep' // Comenzi noi
    ];

    function logToTerminal(message) {
        if (message === null || typeof message === 'undefined') return;
        // Păstrează formatarea spațiilor multiple și a liniilor noi
        const formattedMessage = message.toString().replace(/ /g, '&nbsp;');
        output.innerHTML += `<p style="white-space: pre-wrap;">${formattedMessage}</p>`;
        output.scrollTop = output.scrollHeight;
    }

    function updatePrompt() {
        if (isCommandRunning) {
            promptElement.parentElement.style.display = 'none';
        } else {
            const displayPath = currentPath === '.' ? '~' : `~/${currentPath.replace(/^\.\//, '')}`;
            promptElement.textContent = `user@webos:${displayPath}$`;
            promptElement.parentElement.style.display = 'flex';
            input.focus();
        }
    }

    function resolveClientPath(targetPath) {
        if (!targetPath) return currentPath;
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
        help: (args, context) => `Available commands: ${availableCommands.join(', ')}`,
        clear: (args, context) => { output.innerHTML = ''; return null; },
        echo: (args, context) => args.join(' ').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
        date: (args, context) => new Date().toLocaleString(),
        pwd: (args, context) => currentPath === '.' ? '/' : `/${currentPath}`,
        history: (args, context) => commandHistory.slice().reverse().map((cmd, i) => ` ${i + 1}\t${cmd}`).join('\n'),
        uname: (args, context) => 'WebOS Kernel Version 1.1 (Advanced Process Management)',

        // --- COMENZI NOI ȘI ACTUALIZATE ---
        jobs: async (args, context) => {
            const procTable = await kernel.syscall('proc.list');
            let result = '';
            
            for (const jid in jobs) {
                const job = jobs[jid];
                const mainProcess = procTable[job.pids[0]];
                
                if (mainProcess) {
                     result += `[${jid}] ${mainProcess.status}\t${job.commandStr}\n`;
                } else {
                    // Dacă procesul nu mai e în tabela kernel-ului, îl curățăm
                    delete jobs[jid];
                }
            }
            return result.trim() || 'No active jobs.';
        },
        
        ps: async (args, context) => {
            const table = await kernel.syscall('proc.list');
            const pids = Object.keys(table);
            let result = 'PID\tSTATUS\t\tCOMMAND';
            if (pids.length === 0) return result;
            for (const pid of pids) {
                const proc = table[pid];
                result += `\n${pid}\t${proc.status.padEnd(8, ' ')}\t${proc.commandStr || proc.name}`;
            }
            return result;
        },
        
        kill: async (args, context) => {
            const pidToKill = parseInt(args[0], 10);
            if (isNaN(pidToKill)) throw new Error('kill: usage: kill <pid>');
            
            const success = await kernel.syscall('proc.kill', { pid: pidToKill });
            if (!success) throw new Error(`kill: (${pidToKill}) - No such process`);
            
            // Eliminăm și din lista de joburi dacă e cazul
            for (const jid in jobs) {
                if (jobs[jid].pids.includes(pidToKill)) {
                    delete jobs[jid];
                    break;
                }
            }
            logToTerminal(`Process ${pidToKill} terminated.`);
            return null;
        },

        sleep: (args, context) => {
            const ms = parseInt(args[0] || 1000, 10);
            if (isNaN(ms)) throw new Error('sleep: invalid time');
            return new Promise(resolve => setTimeout(() => resolve(`Slept for ${ms}ms.`), ms));
        },

        ls: async (args, context) => {
            // 1. Parsăm argumentele pentru a separa opțiunile de cale
            const isRecursive = args.includes('-R');
            const pathArg = args.find(arg => !arg.startsWith('-')); // Găsim primul argument care nu este o opțiune
            const path = pathArg ? resolveClientPath(pathArg) : currentPath;

            // 2. Funcție recursivă pentru listare
            const listRecursively = async (currentPath, depth = 0) => {
                let result = '';
                const indent = '  '.repeat(depth);

                try {
                    const entries = await kernel.syscall('fs.readDir', { path: currentPath });
                    
                    for (const entry of entries) {
                        result += `${indent}${entry}\n`;
                        // Dacă este director și avem flag-ul recursiv
                        if (entry.endsWith('/') && isRecursive) {
                            const nextPath = `${currentPath}/${entry}`.replace(/\/+/g, '/').replace(/\/$/, '');
                            // Apel recursiv pentru subdirector
                            result += await listRecursively(nextPath, depth + 1);
                        }
                    }
                } catch (e) {
                    // Dacă un subdirector nu poate fi accesat, afișăm eroarea și continuăm
                    return `${indent}ls: cannot access '${currentPath}': ${e.message}\n`;
                }
                return result;
            };

            // 3. Executăm funcția corespunzătoare
            if (isRecursive) {
                const output = await listRecursively(path);
                return output.trim();
            } else {
                // Comportamentul original, non-recursiv
                const data = await kernel.syscall('fs.readDir', { path });
                return data.join('  ');
            }
        },
        cat: async (args, context) => {
            if (args.length === 0) {
                if (context.stdin) return context.stdin;
                throw new Error('cat: missing file operand');
            }
            const pathArg = args[0];
            const fullPath = resolveClientPath(pathArg);
            const data = await kernel.syscall('fs.readFile', { path: fullPath });
            return data.content;
        },
        cd: async (args, context) => {
            const targetPath = args[0] || '.';
            const newPath = resolveClientPath(targetPath);
            await kernel.syscall('fs.checkDir', { path: newPath });
            currentPath = newPath;
            return null;
        },
        mkdir: async (args, context) => {
            const dirName = args[0];
            if (!dirName) throw new Error('mkdir: missing operand');
            const fullPath = resolveClientPath(dirName);
            await kernel.syscall('fs.makeDir', { path: fullPath });
            return null;
        },
        touch: async (args, context) => {
            const fileName = args[0];
            if (!fileName) throw new Error('touch: missing file operand');
            const fullPath = resolveClientPath(fileName);
            await kernel.syscall('fs.touchFile', { path: fullPath });
            return null;
        },
        rm: async (args, context) => {
            const targetPath = args[0];
            if (!targetPath) throw new Error('rm: missing operand');
            const fullPath = resolveClientPath(targetPath);
            await kernel.syscall('fs.remove', { path: fullPath });
            return null;
        },
        mv: async (args, context) => {
            const [source, destination] = args;
            if (!source || !destination) throw new Error('mv: missing operand');
            const sourcePath = resolveClientPath(source);
            const destinationPath = resolveClientPath(destination);
            await kernel.syscall('fs.move', { source: sourcePath, destination: destinationPath });
            return null;
        },
        grep: (args, context) => {
            const pattern = args[0];
            if (!pattern) throw new Error('grep: missing pattern');
            const input = context.stdin;
            if (input === null || typeof input === 'undefined') {
                return ''; // Dacă nu există input, returnează un string gol
            }
            return input.toString().split('\n').filter(line => line.includes(pattern)).join('\n');
        }
    };
    
    function parseCommandLine(commandStr) {
        let isBackground = false;
        if (commandStr.trim().endsWith('&')) {
            isBackground = true;
            commandStr = commandStr.trim().slice(0, -1).trim();
        }

        const pipeline = commandStr.split('|').map(s => s.trim());
        const commandsToRun = [];

        for (const cmdPart of pipeline) {
            let parts = cmdPart.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            let [cmd, ...args] = parts.map(p => p.replace(/"/g, ''));
            let stdout = { type: 'terminal' };
            
            const redirectIndex = args.indexOf('>');
            if (redirectIndex !== -1 && args[redirectIndex + 1]) {
                stdout = { type: 'redirect', file: resolveClientPath(args[redirectIndex + 1]) };
                args.splice(redirectIndex, 2);
            }
            
            commandsToRun.push({ name: cmd, args, stdout });
        }
        return { pipeline: commandsToRun, background: isBackground };
    }

    async function processCommand(commandStr) {
        if (isCommandRunning) return;

        commandHistory.unshift(commandStr);
        historyIndex = -1;
        logToTerminal(`${promptElement.textContent} ${commandStr}`);
        
        isCommandRunning = true;
        updatePrompt();
        
        try {
            const { pipeline, background } = parseCommandLine(commandStr);
            if(pipeline.length > 0 && pipeline[0].name) {
                const commandFunctions = pipeline.map(p => ({
                    ...p,
                    logic: commands[p.name],
                    fullCmd: `${p.name} ${p.args.join(' ')}`.trim()
                }));

                for (const cmd of commandFunctions) {
                    if (!cmd.logic) throw new Error(`Command not found: ${cmd.name}`);
                }

                const result = await kernel.syscall('proc.pipeline', {
                    pipeline: commandFunctions,
                    background: background,
                    logFunction: logToTerminal
                });

                if (background && result && result.pids) {
                    const jid = nextJobId++;
                    jobs[jid] = { pids: result.pids, commandStr };
                    logToTerminal(`[${jid}] ${result.pids.join(' ')}`);
                }
            }
        } catch (error) {
            logToTerminal(error.message);
        } finally {
            isCommandRunning = false;
            updatePrompt();
        }
    }

    // Event Listeners
    container.addEventListener('click', () => {
        if (!isCommandRunning) input.focus();
    });

    input.addEventListener('keydown', async (e) => {
        if (isCommandRunning) return;

        if (e.key === 'Enter') {
            const command = input.value.trim();
            input.value = '';
            if (command) {
                await processCommand(command);
            } else {
                updatePrompt();
            }
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
            const currentInput = input.value;
            const parts = currentInput.split(' ');
            const partial = parts[parts.length - 1];
            
            const matches = availableCommands.filter(c => c.startsWith(partial));
            
            if (matches.length === 1) {
                parts[parts.length - 1] = matches[0];
                input.value = parts.join(' ') + ' ';
            } else if (matches.length > 1) {
                logToTerminal(`${promptElement.textContent} ${currentInput}`);
                logToTerminal(matches.join('  '));
                updatePrompt();
            }
        }
    });

    logToTerminal('WebOS Terminal v7.0 (Advanced Process Management).');
    updatePrompt();
}