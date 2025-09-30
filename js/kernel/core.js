// File: js/kernel/core.js

import { dmesg } from '../utils/logger.js';
import * as vfs from '../vfs/client.js';
import { syscall } from './syscalls.js';

const eventListeners = new Map();
const processes = new Map();
let nextPid = 1;

// --- Event System ---
export function on(eventName, handler) {
    if (!eventListeners.has(eventName)) {
        eventListeners.set(eventName, []);
    }
    eventListeners.get(eventName).push(handler);
}

export function trigger(eventName, ...args) {
    const handlers = eventListeners.get(eventName);
    if (handlers) {
        handlers.forEach(handler => handler(...args));
    }
}

// --- Kernel Init ---
export function initKernel() {
    dmesg('Kernel initializing...');
    setupSyscallHandlers();
    dmesg('Syscall handlers registered.');
    dmesg('Kernel initialized.');
    return Promise.resolve();
}

// --- Syscall and Process Management ---
async function handleSyscallFromWorker(pid, syscallData) {
    const { id, name, params } = syscallData;
    const handlers = eventListeners.get(name);

    if (handlers && handlers.length > 0) {
        try {
            const augmentedParams = (typeof params === 'object' && params !== null && !Array.isArray(params))
                ? { ...params, pid }
                : { data: params, pid };

            let result;
            // rulează TOȚI handlerii, nu doar primul
            for (const h of handlers) {
                result = await new Promise((resolve, reject) => {
                    h(augmentedParams, resolve, reject);
                });
            }

            const proc = processes.get(pid);
            if (proc) {
                proc.worker.postMessage({ type: 'syscall.result', id, result });
            }
        } catch (error) {
            const proc = processes.get(pid);
            if (proc) {
                proc.worker.postMessage({
                    type: 'syscall.result',
                    id,
                    error: { message: error.message, stack: error.stack }
                });
            }
        }
    } else {
        dmesg(`Unknown syscall '${name}' from pid ${pid}`, 'warn');
        const proc = processes.get(pid);
        if (proc) {
            const error = new Error(`Unknown syscall: ${name}`);
            proc.worker.postMessage({
                type: 'syscall.result',
                id,
                error: { message: error.message, stack: error.stack }
            });
        }
    }
}

function handleProcExit(pid, exitCode) {
    const proc = processes.get(pid);
    if (proc) {
        if (proc.onDone) {
            proc.onDone(exitCode);
        }
        proc.worker.terminate();
        processes.delete(pid);
        dmesg(`proc ${pid} (${proc.name}) exited with code ${exitCode}.`);
    }
}

function setupSyscallHandlers() {
    // Procese
    on('proc.pipeline', async (params, resolve) => {
        const { pipeline, onOutput, onDone, cwd } = params;

        if (!pipeline || pipeline.length === 0) {
            if (onDone) onDone(0);
            return resolve();
        }

        const firstProc = pipeline[0];
        const newPid = nextPid++;
        const worker = new Worker('/js/kernel/process_worker.js', { type: 'module' });

        processes.set(newPid, {
            pid: newPid,
            worker,
            name: firstProc.name,
            onOutput,
            onDone,
        });

        worker.onmessage = (e) => {
            const { type, pid, ...data } = e.data;
            switch (type) {
                case 'syscall':
                    handleSyscallFromWorker(pid, data.syscall);
                    break;
                case 'proc.exit':
                    handleProcExit(pid, data.exitCode);
                    break;
                case 'proc.crash':
                    dmesg(`proc ${pid} crashed: ${data.error.message}`, 'error');
                    console.error('Stack trace:', data.error.stack);
                    handleProcExit(pid, 1);
                    break;
            }
        };

        worker.onerror = (err) => {
            dmesg(`Unhandled error in worker for proc ${newPid}: ${err.message}`, 'error');
            handleProcExit(newPid, 1);
        };

        worker.postMessage({
            type: 'init',
            pid: newPid,
            proc: firstProc,
            cwd
        });

        resolve(newPid);
    });

    // Stdout/Stderr
    on('stdout', (params, resolve) => {
        const proc = processes.get(params.pid);
        if (proc && proc.onOutput) {
            proc.onOutput(params.data);
        }
        resolve();
    });

    on('stderr', (params, resolve) => {
        const proc = processes.get(params.pid);
        if (proc && proc.onOutput) {
            proc.onOutput({ type: 'error', message: params.data });
        }
        resolve();
    });

    // --- VFS Syscalls ---
    on('vfs.read', async ({ path }, resolve, reject) => {
        try {
            const data = await vfs.readFile(path);
            resolve(data);
        } catch (e) {
            reject(e);
        }
    });

    on('vfs.write', async ({ path, data }, resolve, reject) => {
        try {
            await vfs.writeFile(path, data);
            resolve({ success: true });
        } catch (e) {
            reject(e);
        }
    });

    on('vfs.mkdir', async ({ path }, resolve, reject) => {
        try {
            await vfs.mkdir(path);
            resolve({ success: true });
        } catch (e) {
            reject(e);
        }
    });

    on('vfs.readdir', async ({ path }, resolve, reject) => {
        try {
            const files = await vfs.readdir(path);
            resolve(files);
        } catch (e) {
            reject(e);
        }
    });

    on('vfs.rm', async ({ path, force, recursive }, resolve, reject) => {
        try {
            await vfs.remove(path, force, recursive);
            resolve({ success: true });
        } catch (e) {
            reject(e);
        }
    });

    on('vfs.stat', async ({ path }, resolve, reject) => {
        try {
            const stats = await vfs.stat(path);
            resolve(stats);
        } catch (e) {
            reject(e);
        }
    });
}

// Funcția exec pentru terminal.js
export function exec(pipeline, onOutput, onDone, cwd) {
    return new Promise((resolve, reject) => {
        try {
            trigger('proc.pipeline', { pipeline, onOutput, onDone, cwd }, resolve, reject);
        } catch (e) {
            console.error("Error triggering proc.pipeline from exec:", e);
            reject(e);
        }
    });
}
