// js/kernel.js

import { startBootSequence } from './boot.js';

let processTable = {};
let nextPid = 1;

const SERVER_URL = 'http://localhost:3000/api';

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
    async syscall(call, params) {
        console.log(`Syscall: ${call}`, params);

        switch (call) {
            case 'proc.run': // Wrapper simplu pentru pipeline cu o singură comandă
                return await this.syscall('proc.pipeline', {
                    pipeline: [{...params, stdout: 'terminal'}],
                    logFunction: params.logFunction
                });

            case 'proc.pipeline': {
                let stdin = null; // stdin pentru prima comandă este null

                for (let i = 0; i < params.pipeline.length; i++) {
                    const procInfo = params.pipeline[i];
                    let stdout = '';
                    
                    const context = {
                        stdin: stdin,
                        log: params.logFunction // Pentru comenzi ca 'ping' care scriu direct
                    };

                    const pid = nextPid++;
                    processTable[pid] = { name: procInfo.name, status: 'running' };

                    try {
                        const output = await procInfo.logic(procInfo.args, context);
                        if(output) stdout = output;
                    } catch(e) {
                         params.logFunction(e.message); // Afișăm eroarea în terminal
                         delete processTable[pid];
                         return; // Oprim pipeline-ul la eroare
                    } finally {
                        delete processTable[pid];
                    }

                    // Pregătim input-ul pentru următoarea comandă
                    stdin = stdout;

                    // Dacă este ultima comandă
                    if (i === params.pipeline.length - 1) {
                        if (procInfo.stdout.type === 'redirect') {
                            await this.syscall('fs.writeFile', { path: procInfo.stdout.file, content: stdout });
                        } else {
                            params.logFunction(stdout);
                        }
                    }
                }
                return;
            }
            
            case 'proc.list':
                return Promise.resolve({ ...processTable });

            case 'fs.writeFile': // Syscall nou pentru scriere
                return await apiRequest('touch', 'POST', { path: params.path, content: params.content });
            
            // ... restul syscalls (neschimbate) ...
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
            case 'fs.copy':
                return await apiRequest('copy', 'POST', { source: params.source, destination: params.destination });

            default:
                throw new Error(`Unknown syscall: ${call}`);
        }
    }
};

console.log("Kernel loaded. Starting boot sequence...");
startBootSequence();