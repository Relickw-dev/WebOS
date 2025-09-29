// File: js/kernel/process_worker.js

let pid;
let syscall;

/**
 * Acest handler primește mesajele de la kernel (core.js)
 * 'init': Pornește un nou proces.
 * 'syscall.result': Primește rezultatul unui apel de sistem.
 */
self.onmessage = async (e) => {
    const { type, ...data } = e.data;

    switch (type) {
        case 'init':
            pid = data.pid;
            const proc = data.proc;
            
            // Creează interfața de syscalls pentru acest proces
            syscall = createSyscallInterface(pid);
            
            try {
                // Importă dinamic modul procesului folosind calea primită
                const module = await import(proc.logicPath);
                // Apelează funcția 'main' exportată de modul
                await module.default(proc.args, syscall);
                // Trimite mesaj de ieșire cu succes
                self.postMessage({ type: 'proc.exit', pid, exitCode: 0 });
            } catch (error) {
                // Trimite mesaj de eroare critică (crash)
                self.postMessage({ type: 'proc.crash', pid, error: { message: error.message, stack: error.stack } });
            }
            break;

        case 'syscall.result':
            // Răspunsul de la kernel a sosit, trimite-l handler-ului
            syscall.handleResult(data);
            break;
    }
};

/**
 * Creează și returnează funcțiile pe care un proces le poate folosi
 * pentru a comunica cu kernel-ul.
 */
function createSyscallInterface(pid) {
    let nextSyscallId = 0;
    const pendingSyscalls = new Map();

    // Funcția principală 'syscall' pe care o va apela procesul
    const syscallFunction = (name, params) => {
        return new Promise((resolve, reject) => {
            const id = nextSyscallId++;
            pendingSyscalls.set(id, { resolve, reject });
            // Trimite cererea de syscall către kernel
            self.postMessage({
                type: 'syscall',
                pid,
                syscall: { id, name, params }
            });
        });
    };

    // Funcție atașată pentru a gestiona răspunsurile de la kernel
    syscallFunction.handleResult = ({ id, result, error }) => {
        const promise = pendingSyscalls.get(id);
        if (promise) {
            if (error && error.message) {
                const err = new Error(error.message);
                err.stack = error.stack; 
                promise.reject(err);
            } else if (error) {
                promise.reject(new Error(String(error)));
            } else {
                promise.resolve(result);
            }
            pendingSyscalls.delete(id);
        }
    };

    return syscallFunction;
}