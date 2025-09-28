// js/kernel.js

import { startBootSequence } from './boot.js';

let processTable = {};
let nextPid = 1;

const SERVER_URL = 'http://localhost:3000/api';

async function apiRequest(endpoint, method = 'POST', body = null) {
    try {
        const options = { method, headers: {} };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
        // GET requests for 'cat' are a special case
        if (endpoint.startsWith('cat?')) {
            options.method = 'GET';
            options.body = null;
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
    spawnProcess(name, commandStr) {
        const pid = nextPid++;
        processTable[pid] = {
            pid,
            name,
            commandStr,
            status: 'running',
            startTime: Date.now(),
        };
        console.log(`Spawned process ${pid}: ${name}`);
        return processTable[pid];
    },

    killProcess(pid) {
        if (processTable[pid]) {
            delete processTable[pid];
            console.log(`Killed process ${pid}`);
            return true;
        }
        return false;
    },

    async syscall(call, params) {
        console.log(`Syscall: ${call}`, params);

        switch (call) {
            case 'proc.pipeline': {
                const { pipeline, background, logFunction } = params;
                let stdin = null;
                const pipelinePids = [];

                const execute = async () => {
                    try {
                        for (let i = 0; i < pipeline.length; i++) {
                            const procInfo = pipeline[i];
                            const process = this.spawnProcess(procInfo.name, procInfo.fullCmd);
                            pipelinePids.push(process.pid);
                            
                            let stdout = '';
                            try {
                                const output = await procInfo.logic(procInfo.args, { stdin, log: logFunction });
                                if (output !== null && typeof output !== 'undefined') stdout = output;
                                if (processTable[process.pid]) processTable[process.pid].status = 'done';
                            } catch (e) {
                                if (processTable[process.pid]) processTable[process.pid].status = 'error';
                                throw e;
                            }

                            stdin = stdout;

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
                    } finally {
                        if (!background) {
                            pipelinePids.forEach(pid => delete processTable[pid]);
                        }
                    }
                };
                
                if (background) {
                    execute();
                    return { pids: pipelinePids };
                } else {
                    await execute();
                    return null;
                }
            }
            
            case 'proc.list':
                return Promise.resolve(JSON.parse(JSON.stringify(processTable)));

            case 'proc.kill':
                return Promise.resolve(this.killProcess(params.pid));

            // File System Syscalls
            case 'fs.writeFile':
                return await apiRequest('touch', 'POST', { path: params.path, content: params.content });
            case 'fs.readDir':
                return await apiRequest('files', 'POST', { path: params.path, options: params.options });
            case 'fs.readFile':
                return await apiRequest(`cat?path=${encodeURIComponent(params.path)}`);
            case 'fs.checkDir':
                return await apiRequest('checkdir', 'POST', { path: params.path });
            case 'fs.makeDir':
                return await apiRequest('mkdir', 'POST', { path: params.path, createParents: params.createParents });
            case 'fs.touchFile':
                return await apiRequest('touch', 'POST', { path: params.path });
            case 'fs.remove':
                return await apiRequest('rm', 'POST', { path: params.path, force: params.force });
            case 'fs.move':
                return await apiRequest('mv', 'POST', { source: params.source, destination: params.destination });
            case 'fs.copy':
                return await apiRequest('copy', 'POST', { source: params.source, destination: params.destination, recursive: params.recursive });

            default:
                throw new Error(`Unknown syscall: ${call}`);
        }
    }
};

console.log("Kernel loaded. Starting boot sequence...");
startBootSequence();