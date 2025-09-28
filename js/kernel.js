// js/kernel.js

import { startBootSequence } from './boot.js';

// --- SISTEM DE PROCESE ACTUALIZAT ---
let processTable = {}; // Tabela globală de procese
let nextPid = 1;       // Contor global pentru PID-uri

const SERVER_URL = 'http://localhost:3000/api';

// Funcție ajutătoare pentru request-uri API (neschimbată)
async function apiRequest(endpoint, method = 'GET', body = null) {
    try {
        const options = { method, headers: {} };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        const response = await fetch(`${SERVER_URL}/${endpoint}`, options);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        return data;
    } catch (error) {
        throw new Error(error.message || 'Connection to server failed.');
    }
}

export const kernel = {
    // Funcție de bază pentru crearea unui proces
    spawnProcess(name, logic, commandStr) {
        const pid = nextPid++;
        const process = {
            pid,
            name,
            commandStr,
            status: 'running', 
            startTime: Date.now(),
            logic // Păstrăm funcția logică pentru a o executa
        };
        processTable[pid] = process;
        console.log(`Spawned process ${pid}: ${name}`);
        return process;
    },
    
    // Funcție pentru a termina un proces
    killProcess(pid) {
        if (processTable[pid]) {
            // Într-un OS real, am trimite un semnal de terminare.
            // Aici, pur și simplu îl eliminăm din tabelă.
            delete processTable[pid];
            console.log(`Killed process ${pid}`);
            return true;
        }
        return false;
    },
    
    async syscall(call, params) {
        console.log(`Syscall: ${call}`, params);

        switch (call) {
            // Syscall pentru a executa un pipeline de procese
            case 'proc.pipeline': {
                const { pipeline, background, logFunction } = params;
                let stdin = null;
                let pipelinePids = [];

                const execute = async () => {
                    try {
                        for (let i = 0; i < pipeline.length; i++) {
                            const procInfo = pipeline[i];
                            
                            // Creăm un proces nou pentru fiecare comandă din pipeline
                            const process = this.spawnProcess(procInfo.name, procInfo.logic, procInfo.fullCmd);
                            pipelinePids.push(process.pid);
                            
                            let stdout = '';
                            try {
                                const output = await procInfo.logic(procInfo.args, { stdin, log: logFunction });
                                if (output) stdout = output;
                                processTable[process.pid].status = 'done'; // Marcăm ca finalizat
                            } catch (e) {
                                processTable[process.pid].status = 'error'; // Marcăm eroarea
                                throw e; // Propagăm eroarea pentru a opri pipeline-ul
                            }

                            stdin = stdout;

                            // La finalul pipeline-ului, gestionăm output-ul
                            if (i === pipeline.length - 1) {
                                if (procInfo.stdout.type === 'redirect') {
                                    await this.syscall('fs.writeFile', { path: procInfo.stdout.file, content: stdout });
                                } else {
                                    logFunction(stdout);
                                }
                            }
                        }
                    } catch (e) {
                        logFunction(e.message);
                        // Curățăm procesele eșuate
                        pipelinePids.forEach(pid => {
                            if (processTable[pid] && processTable[pid].status !== 'done') {
                                delete processTable[pid];
                            }
                        });
                    } finally {
                        // Procesele care nu sunt de background sunt șterse după execuție
                        if (!background) {
                            pipelinePids.forEach(pid => delete processTable[pid]);
                        }
                    }
                };
                
                // Returnează PID-urile create pentru ca shell-ul să le gestioneze
                if (background) {
                    execute(); // Rulează în fundal
                    return { pids: pipelinePids };
                } else {
                    await execute(); // Așteaptă finalizarea
                    return null;
                }
            }
            
            // Syscall pentru a lista procesele
            case 'proc.list': {
                // Returnează o copie a tabelei pentru a preveni modificări externe
                return Promise.resolve(JSON.parse(JSON.stringify(processTable)));
            }

            // Syscall pentru a ucide un proces
            case 'proc.kill': {
                return Promise.resolve(this.killProcess(params.pid));
            }

            // Syscalls pentru file system (neschimbate)
            case 'fs.writeFile':
                return await apiRequest('touch', 'POST', { path: params.path, content: params.content });
            case 'fs.readDir':
                return await apiRequest(`files?path=${encodeURIComponent(params.path)}`);
            case 'fs.readFile':
                return await apiRequest(`cat?path=${encodeURIComponent(params.path)}`);
            case 'fs.checkDir':
                return await apiRequest('checkdir', 'POST', { path: params.path });
            case 'fs.makeDir':
                return await apiRequest('mkdir', 'POST', { path: params.path });
            case 'fs.touchFile':
                return await apiRequest('touch', 'POST', { path: params.path });
            case 'fs.remove':
                return await apiRequest('rm', 'POST', { path: params.path });
            case 'fs.move':
                return await apiRequest('mv', 'POST', { source: params.source, destination: params.destination });

            default:
                throw new Error(`Unknown syscall: ${call}`);
        }
    }
};

console.log("Kernel loaded. Starting boot sequence...");
startBootSequence();