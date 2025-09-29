// File: js/kernel/core.js

import { dmesg } from '../utils/logger.js';

const syscallHandlers = new Map();
const eventListeners = new Map();
const processes = new Map();
let nextPid = 1;

// --- Public Kernel API ---
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
            const augmentedParams = { ...params, pid };
            const result = await new Promise((resolve, reject) => {
                // Presupunem că handler-ul este asincron și folosește resolve/reject
                handlers[0](augmentedParams, resolve, reject);
            });
            
            const proc = processes.get(pid);
            if (proc) {
                proc.worker.postMessage({ type: 'syscall.result', id, result });
            }
        } catch (error) {
            const proc = processes.get(pid);
            if (proc) {
                proc.worker.postMessage({ type: 'syscall.result', id, error: { message: error.message } });
            }
        }
    } else {
        dmesg(`Unknown syscall '${name}' from pid ${pid}`, 'warn');
        const proc = processes.get(pid);
        if (proc) {
           proc.worker.postMessage({ type: 'syscall.result', id, error: { message: `Unknown syscall: ${name}` } });
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
    // Handler pentru crearea unui lanț de procese (chiar dacă e doar unul)
    on('proc.pipeline', async (params, resolve) => {
        const { pipeline, onOutput, onDone } = params;
        
        // Simplificare: deocamdată gestionăm doar prima comandă din pipeline
        if (!pipeline || pipeline.length === 0) {
            if (onDone) onDone(0);
            return resolve();
        }
        const firstProc = pipeline[0];

        const newPid = nextPid++;
        const worker = new Worker('/js/kernel/process_worker.js', { type: 'module' });

        processes.set(newPid, {
            pid: newPid,
            worker: worker,
            name: firstProc.name,
            onOutput: onOutput,
            onDone: onDone,
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
                    handleProcExit(pid, 1); // Non-zero exit code for crash
                    break;
            }
        };

        worker.onerror = (err) => {
            dmesg(`Unhandled error in worker for proc ${newPid}: ${err.message}`, 'error');
            handleProcExit(newPid, 1);
        };

        // Trimite mesajul de inițializare cu structura corectă
        worker.postMessage({
            type: 'init',
            pid: newPid,
            proc: firstProc,
        });

        resolve(newPid);
    });

    // Handler pentru I/O standard
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
            // Trimitem ca obiect de eroare pentru a putea fi stilizat diferit in terminal
            proc.onOutput({ type: 'error', message: params.data });
        }
        resolve();
    });
}