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
    let jobCounter = 1;

    const availableCommands = ['help', 'clear', 'echo', 'date', 'ls', 'cat', 'cd', 'mkdir', 'touch', 'rm', 'mv', 'ps', 'ping', 'grep', 'pwd', 'history', 'uname'];

    function logToTerminal(message) {
        if (message === null || typeof message === 'undefined') return;
        output.innerHTML += `<p style="white-space: pre-wrap;">${message}</p>`;
        output.scrollTop = output.scrollHeight;
    }

    function updatePrompt() {
        const displayPath = currentPath === '.' ? '~' : `~/${currentPath}`;
        promptElement.textContent = `user@webos:${displayPath}$`;
    }

    function resolveClientPath(targetPath) {
        if (targetPath.startsWith('/')) return targetPath.substring(1) || '.';
        const pathParts = currentPath === '.' ? [] : currentPath.split('/');
        const targetParts = targetPath.split('/').filter(p => p);
        for (const part of targetParts) {
            if (part === '..') pathParts.pop();
            else if (part !== '.') pathParts.push(part);
        }
        let newPath = pathParts.join('/');
        return newPath === '' ? '.' : newPath;
    }

    const commands = {
        help: (args, context) => `Available commands: ${availableCommands.join(', ')}`,
        clear: (args, context) => { output.innerHTML = ''; return null; },
        echo: (args, context) => args.join(' ').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
        date: (args, context) => new Date().toLocaleString(),
        pwd: (args, context) => currentPath,
        history: (args, context) => commandHistory.slice(1).reverse().map((cmd, i) => ` ${i + 1}\t${cmd}`).join('\n'),
        uname: (args, context) => 'WebOS Kernel Version 1.0',

        ls: async (args, context) => {
            const path = args[0] ? resolveClientPath(args[0]) : currentPath;
            const data = await kernel.syscall('fs.readDir', { path });
            return data.join('  ');
        },
        cat: async (args, context) => {
            if (args.length === 0) return context.stdin;
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
        ps: async (args, context) => {
            const table = await kernel.syscall('proc.list');
            const pids = Object.keys(table);
            let result = 'PID\tCOMMAND';
            if (pids.length === 0) return result;
            for (const pid of pids) {
                result += `\n${pid}\t${table[pid].name}`;
            }
            return result;
        },
        grep: (args, context) => {
            const pattern = args[0];
            if (!pattern) throw new Error('grep: missing pattern');
            if (!context.stdin) return '';
            return context.stdin.split('\n').filter(line => line.includes(pattern)).join('\n');
        }
    };
    
    // --- PARSER ACTUALIZAT ---
    function parseCommandLine(commandStr) {
        let isBackground = false;
        if (commandStr.trim().endsWith('&')) {
            isBackground = true;
            commandStr = commandStr.trim().slice(0, -1).trim(); // Elimină '&'
        }

        const pipeline = commandStr.split('|').map(s => s.trim());
        const commandsToRun = [];

        for (const cmdPart of pipeline) {
            let parts = cmdPart.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
            let [cmd, ...args] = parts.map(p => p.replace(/"/g, ''));
            let stdout = 'terminal';
            
            const redirectIndex = args.indexOf('>');
            if (redirectIndex !== -1) {
                stdout = { type: 'redirect', file: args[redirectIndex + 1] };
                args.splice(redirectIndex, 2);
            }
            
            commandsToRun.push({ name: cmd, args, stdout });
        }
        return { pipeline: commandsToRun, background: isBackground };
    }

    async function processCommand(commandStr) {
        commandHistory.unshift(commandStr);
        historyIndex = -1;
        logToTerminal(`${promptElement.textContent} ${commandStr}`);
        
        try {
            const { pipeline, background } = parseCommandLine(commandStr);
            if(pipeline.length > 0 && pipeline[0].name) {
                const commandFunctions = pipeline.map(p => ({ ...p, logic: commands[p.name] }));

                for (const cmd of commandFunctions) {
                    if (!cmd.logic) throw new Error(`Command not found: ${cmd.name}`);
                }

                const result = await kernel.syscall('proc.pipeline', {
                    pipeline: commandFunctions,
                    background: background,
                    logFunction: logToTerminal
                });

                if (background && result && result.pid) {
                    logToTerminal(`[${jobCounter++}] ${result.pid}`);
                }
            }
        } catch (error) {
            logToTerminal(error.message);
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

    logToTerminal('WebOS Terminal v6.1 (Background Jobs).');
    updatePrompt();
    input.focus();
}