// js/terminal.js

import { kernel } from './kernel.js';

// Funcție ajutătoare pentru a separa opțiunile de argumentele simple
function parseArgs(args) {
    const options = new Set();
    const cleanArgs = [];
    for (const arg of args) {
        if (arg.startsWith('-') && arg.length > 1) {
            for (let i = 1; i < arg.length; i++) {
                options.add(arg[i]);
            }
        } else {
            cleanArgs.push(arg);
        }
    }
    return { options, cleanArgs };
}

export function initializeTerminal() {
    const container = document.getElementById('container');
    const output = document.getElementById('terminal-output');
    const input = document.getElementById('terminal-input');
    const promptElement = document.getElementById('prompt');

    const commandHistory = [];
    let historyIndex = -1;
    let currentPath = '.';
    
    let jobs = {};
    let nextJobId = 1;
    let isCommandRunning = false;
    let isAwaitingConfirmation = false;
    let confirmationResolver = null;

    const availableCommands = [
        'help', 'clear', 'echo', 'date', 'ls', 'cat', 'cd', 'mkdir', 
        'touch', 'rm', 'mv', 'cp', 'ps', 'grep', 'pwd', 'history', 'uname',
        'jobs', 'kill', 'sleep' 
    ];

    function logToTerminal(message) {
        if (message === null || typeof message === 'undefined' || message === '') return;
        output.innerHTML += `<p>${message.toString().replace(/\n/g, '<br>').replace(/ /g, '&nbsp;')}</p>`;
        output.scrollTop = output.scrollHeight;
    }

    function updatePrompt() {
        if (isCommandRunning || isAwaitingConfirmation) {
            promptElement.parentElement.style.display = 'none';
        } else {
            const displayPath = currentPath === '.' ? '~' : `~/${currentPath.replace(/^\.\//, '')}`;
            promptElement.textContent = `user@webos:${displayPath}$`;
            promptElement.parentElement.style.display = 'flex';
            input.focus();
        }
    }
    
    function awaitConfirmation(promptMessage) {
        logToTerminal(`${promptMessage} (y/n)`);
        isAwaitingConfirmation = true;
        updatePrompt();
        return new Promise(resolve => {
            confirmationResolver = resolve;
        });
    }

    function resolveClientPath(targetPath) {
        if (!targetPath) return currentPath;
        if (targetPath.startsWith('/')) return targetPath.substring(1) || '.';
        
        const pathParts = currentPath === '.' ? [] : currentPath.split('/');
        const targetParts = targetPath.split('/').filter(p => p);

        for (const part of targetParts) {
            if (part === '..') pathParts.pop();
            else if (part !== '.') pathParts.push(part);
        }
        return pathParts.join('/') || '.';
    }

    const commands = {
        help: () => `Available commands: ${availableCommands.join(', ')}`,
        clear: () => { output.innerHTML = ''; return null; },
        echo: (args) => args.join(' ').replace(/^"|"$/g, '').replace(/\\n/g, '\n'),
        date: () => new Date().toLocaleString(),
        pwd: () => currentPath === '.' ? '/' : `/${currentPath}`,
        history: () => commandHistory.slice().reverse().map((cmd, i) => ` ${i + 1}\t${cmd}`).join('\n'),
        uname: () => 'WebOS Kernel Version 2.0 (Robust File System)',
        jobs: async () => {
            const procTable = await kernel.syscall('proc.list');
            let result = '';
            for (const jid in jobs) {
                const job = jobs[jid];
                const mainProcess = procTable[job.pids[0]];
                if (mainProcess) {
                     result += `[${jid}] ${mainProcess.status}\t${job.commandStr}\n`;
                } else {
                    delete jobs[jid];
                }
            }
            return result.trim() || 'No active jobs.';
        },
        ps: async () => {
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
        kill: async (args) => {
            const pidToKill = parseInt(args[0], 10);
            if (isNaN(pidToKill)) throw new Error('kill: usage: kill <pid>');
            const success = await kernel.syscall('proc.kill', { pid: pidToKill });
            if (!success) throw new Error(`kill: (${pidToKill}) - No such process`);
            for (const jid in jobs) {
                if (jobs[jid].pids.includes(pidToKill)) delete jobs[jid];
            }
            logToTerminal(`Process ${pidToKill} terminated.`);
            return null;
        },
        sleep: (args) => new Promise(resolve => setTimeout(() => resolve(`Slept for ${parseInt(args[0], 10)}ms.`), parseInt(args[0] || 1000, 10))),

        ls: async (args) => {
            const { options, cleanArgs } = parseArgs(args);
            const path = cleanArgs[0] ? resolveClientPath(cleanArgs[0]) : currentPath;
            const lsOptions = { showHidden: options.has('a'), longFormat: options.has('l') };
            const data = await kernel.syscall('fs.readDir', { path, options: lsOptions });

            if (lsOptions.longFormat) {
                return data.map(item => {
                    const type = item.isDirectory ? 'd' : '-';
                    const perms = 'rwxr-xr-x';
                    const size = item.size.toString().padStart(8, ' ');
                    const mtime = new Date(item.mtime).toLocaleDateString();
                    const name = item.isDirectory ? `<span style="color: #6495ED;">${item.name}/</span>` : `<span style="color: #32CD32;">${item.name}</span>`;
                    return `${type}${perms} ${size} ${mtime} ${name}`;
                }).join('\n');
            } else {
                return data.map(item => 
                    item.endsWith('/') ? `<span style="color: #6495ED;">${item}</span>` : `<span style="color: #32CD32;">${item}</span>`
                ).join('  ');
            }
        },
        cat: async (args, context) => {
            const { options, cleanArgs } = parseArgs(args);
            if (cleanArgs.length === 0) {
                if (context.stdin) return context.stdin;
                throw new Error('cat: missing file operand');
            }
            let fullContent = '';
            for (const file of cleanArgs) {
                const data = await kernel.syscall('fs.readFile', { path: resolveClientPath(file) });
                fullContent += data.content;
            }
            return options.has('n') ? fullContent.split('\n').map((line, i) => `${(i + 1).toString().padStart(6, ' ')}  ${line}`).join('\n') : fullContent;
        },
        mkdir: async (args) => {
            const { options, cleanArgs } = parseArgs(args);
            if (cleanArgs.length === 0) throw new Error('mkdir: missing operand');
            for (const dirName of cleanArgs) {
                await kernel.syscall('fs.makeDir', { path: resolveClientPath(dirName), createParents: options.has('p') });
            }
            return null;
        },
        rm: async (args) => {
            const { options, cleanArgs } = parseArgs(args);
            if (cleanArgs.length === 0) throw new Error('rm: missing operand');
            const isInteractive = options.has('i'), isForced = options.has('f');

            for (const target of cleanArgs) {
                if (isInteractive && !isForced) {
                    const confirmation = await awaitConfirmation(`rm: remove '${target}'?`);
                    if (!confirmation) continue;
                }
                await kernel.syscall('fs.remove', { path: resolveClientPath(target), force: isForced });
            }
            return null;
        },
        mv: async (args) => {
            const { cleanArgs } = parseArgs(args);
            if (cleanArgs.length < 2) throw new Error('mv: missing file operand');
            const destination = cleanArgs.pop();
            for (const source of cleanArgs) {
                await kernel.syscall('fs.move', { source: resolveClientPath(source), destination: resolveClientPath(destination) });
            }
            return null;
        },
        cp: async (args) => {
            const { options, cleanArgs } = parseArgs(args);
            if (cleanArgs.length < 2) throw new Error('cp: missing file operand');
            const destination = cleanArgs.pop();
            for (const source of cleanArgs) {
                await kernel.syscall('fs.copy', { source: resolveClientPath(source), destination: resolveClientPath(destination), recursive: options.has('r') });
            }
            return null;
        },
        cd: async (args) => {
            const targetPath = args[0] || '.';
            const newPath = resolveClientPath(targetPath);
            await kernel.syscall('fs.checkDir', { path: newPath });
            currentPath = newPath;
            return null;
        },
        touch: async (args) => {
            if (args.length === 0) throw new Error('touch: missing file operand');
            for (const fileName of args) {
                await kernel.syscall('fs.touchFile', { path: resolveClientPath(fileName) });
            }
            return null;
        },
        grep: (args, context) => {
            const pattern = args[0];
            if (!pattern) throw new Error('grep: missing pattern');
            if (context.stdin === null || typeof context.stdin === 'undefined') return '';
            return context.stdin.toString().split('\n').filter(line => line.includes(pattern)).join('\n');
        }
    };

    function parseCommandLine(commandStr) {
        let isBackground = commandStr.trim().endsWith('&');
        if (isBackground) commandStr = commandStr.trim().slice(0, -1).trim();

        return {
            pipeline: commandStr.split('|').map(s => {
                let parts = s.trim().match(/(?:[^\s"']+|"[^"]*"|'[^']*')+/g) || [];
                let [cmd, ...args] = parts.map(p => p.replace(/^["']|["']$/g, ''));
                let stdout = { type: 'terminal' };
                const redirectIndex = args.indexOf('>');
                if (redirectIndex > -1 && args[redirectIndex + 1]) {
                    stdout = { type: 'redirect', file: resolveClientPath(args[redirectIndex + 1]) };
                    args.splice(redirectIndex, 2);
                }
                return { name: cmd, args, stdout };
            }),
            background: isBackground
        };
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
            if (pipeline.length > 0 && pipeline[0].name) {
                const commandFunctions = pipeline.map(p => ({...p, logic: commands[p.name], fullCmd: `${p.name} ${p.args.join(' ')}`.trim()}));
                for (const cmd of commandFunctions) if (!cmd.logic) throw new Error(`Command not found: ${cmd.name}`);

                const result = await kernel.syscall('proc.pipeline', { pipeline: commandFunctions, background, logFunction: logToTerminal });
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

    container.addEventListener('click', () => { if (!isCommandRunning && !isAwaitingConfirmation) input.focus(); });

    input.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            const command = input.value;
            input.value = '';

            if (isAwaitingConfirmation) {
                logToTerminal(command);
                isAwaitingConfirmation = false;
                confirmationResolver?.(command.toLowerCase() === 'y');
                confirmationResolver = null;
                updatePrompt();
                return;
            }
            if (command.trim()) await processCommand(command.trim());
            else updatePrompt();
        } else if (e.key === 'ArrowUp' && !isAwaitingConfirmation) {
            e.preventDefault();
            if (historyIndex < commandHistory.length - 1) input.value = commandHistory[++historyIndex];
        } else if (e.key === 'ArrowDown' && !isAwaitingConfirmation) {
            e.preventDefault();
            if (historyIndex > 0) input.value = commandHistory[--historyIndex];
            else { historyIndex = -1; input.value = ''; }
        } else if (e.key === 'Tab' && !isAwaitingConfirmation) {
            e.preventDefault();
            const partial = input.value.split(' ').pop();
            const matches = availableCommands.filter(c => c.startsWith(partial));
            if (matches.length === 1) {
                input.value = input.value.substring(0, input.value.lastIndexOf(partial)) + matches[0] + ' ';
            } else if (matches.length > 1) {
                logToTerminal(`${promptElement.textContent} ${input.value}`);
                logToTerminal(matches.join('  '));
                updatePrompt();
            }
        }
    });

    logToTerminal('WebOS Terminal v8.0 (Robust File System & Process Mgmt).');
    updatePrompt();
}