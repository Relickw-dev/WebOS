// File: js/kernel/process_worker.js

let pid = -1;
const ongoingSyscalls = new Map();
let nextSyscallId = 0;

function syscall(name, params = {}) {
    return new Promise((resolve, reject) => {
        const syscallId = nextSyscallId++;
        ongoingSyscalls.set(syscallId, { resolve, reject });

        postMessage({
            type: 'syscall',
            pid: pid,
            syscall: {
                id: syscallId,
                name: name,
                params: params
            }
        });
    });
}

self.onmessage = async (e) => {
    const { type, ...data } = e.data;

    if (type === 'init') {
        pid = data.pid;
        const { logicPath, args } = data.proc; // Această linie va funcționa acum
        
        try {
            const module = await import(logicPath);
            const commandFunction = module.default;
            
            if (typeof commandFunction !== 'function') {
                throw new Error(`The module ${logicPath} does not have a default export that is a function.`);
            }

            const exitCode = await commandFunction(args, syscall);
            
            postMessage({ type: 'proc.exit', pid: pid, exitCode: exitCode || 0 });

        } catch (error) {
            postMessage({ 
                type: 'proc.crash', 
                pid: pid, 
                error: { message: error.message, stack: error.stack }
            });
        }

    } else if (type === 'syscall.result') {
        const { id, result, error } = data;
        const promise = ongoingSyscalls.get(id);
        if (promise) {
            if (error) {
                promise.reject(new Error(error.message));
            } else {
                promise.resolve(result);
            }
            ongoingSyscalls.delete(id);
        }
    }
};