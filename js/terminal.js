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

    // Adăugăm 'ps' la comenzi
    const availableCommands = ['help', 'clear', 'echo', 'date', 'ls', 'cat', 'cd', 'mkdir', 'touch', 'rm', 'mv', 'ps'];

    function logToTerminal(message) {
        // Folosim pre-wrap pentru a menține spațiile multiple (utile pentru 'ps')
        output.innerHTML += `<p style="white-space: pre-wrap;">${message}</p>`;
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
            const data = await kernel.syscall('fs.readDir', { path });
            logToTerminal(data.join('  '));
        },

        cat: async (args) => {
            const pathArg = args[0];
            if (!pathArg) return logToTerminal('cat: missing operand');
            const fullPath = resolveClientPath(pathArg);
            const data = await kernel.syscall('fs.readFile', { path: fullPath });
            logToTerminal(data.content);
        },

        cd: async (args) => {
            const targetPath = args[0] || '.';
            const newPath = resolveClientPath(targetPath);
            await kernel.syscall('fs.checkDir', { path: newPath });
            currentPath = newPath;
        },

        mkdir: async (args) => {
            const dirName = args[0];
            if (!dirName) return logToTerminal('mkdir: missing operand');
            const fullPath = resolveClientPath(dirName);
            await kernel.syscall('fs.makeDir', { path: fullPath });
        },
        
        touch: async (args) => {
            const fileName = args[0];
            if (!fileName) return logToTerminal('touch: missing file operand');
            const fullPath = resolveClientPath(fileName);
            await kernel.syscall('fs.touchFile', { path: fullPath });
        },

        rm: async (args) => {
            const targetPath = args[0];
            if (!targetPath) return logToTerminal('rm: missing operand');
            const fullPath = resolveClientPath(targetPath);
            await kernel.syscall('fs.remove', { path: fullPath });
        },

        mv: async (args) => {
            const [source, destination] = args;
            if (!source || !destination) return logToTerminal('mv: missing operand');
            const sourcePath = resolveClientPath(source);
            const destinationPath = resolveClientPath(destination);
            await kernel.syscall('fs.move', { source: sourcePath, destination: destinationPath });
        },
        
        // --- COMANDA NOUĂ 'ps' ---
        ps: async () => {
            const table = await kernel.syscall('proc.list');
            const pids = Object.keys(table);
            logToTerminal('PID\tCOMMAND');
            if (pids.length === 0) {
                return;
            }
            for (const pid of pids) {
                logToTerminal(`${pid}\t${table[pid].name}`);
            }
        }
    };

    async function processCommand(commandStr) {
        commandHistory.unshift(commandStr);
        historyIndex = -1;
        logToTerminal(`${promptElement.textContent} ${commandStr}`);
        const [cmd, ...args] = commandStr.trim().split(' ');

        if (commands[cmd]) {
            try {
                // MODIFICARE CHEIE: Cerem kernel-ului să ruleze comanda ca proces
                await kernel.syscall('proc.run', {
                    name: cmd,
                    logic: commands[cmd],
                    args: args
                });
            } catch (error) {
                logToTerminal(error.message);
            }
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
            if (command) await processCommand(command);
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
    logToTerminal('WebOS Terminal v5.2 (Process Management).');
    updatePrompt();
    input.focus();
}