// File: js/kernel/process_worker.js

let context = {};
let __pid = null; // PID-ul procesului (setat la init)

// Funcția 'exit' poate fi apelată de procese pentru a se termina.
const exit = (exitCode = 0) => {
    // Trimitem pidul ca să poată fi mapat corect în kernel
    self.postMessage({ type: 'proc.exit', pid: __pid, exitCode });
};

// Handler pentru mesajele primite de la kernel (thread-ul principal).
self.onmessage = async (e) => {
    const { type, pid, proc, cwd } = e.data;

    if (type === 'init') {
        // Retinem pid-ul pentru a-l include în toate mesajele ulterioare
        __pid = pid;

        // Proc ar trebui să conțină logicPath și args (așa cum trimite kernel-ul)
        const { logicPath, args } = proc;

        // Stream-urile stderr/stdout sunt proxy-uri către kernel prin syscalls.
        const stderr = { 
            postMessage: (data) => {
                self.postMessage({
                    type: 'syscall',
                    pid: __pid,
                    syscall: { id: Math.random(), name: 'stderr', params: { data } }
                });
            }
        };

        const stdout = { 
            postMessage: (data) => {
                self.postMessage({
                    type: 'syscall',
                    pid: __pid,
                    syscall: { id: Math.random(), name: 'stdout', params: { data } }
                });
            }
        };

        // Construim contextul de execuție pentru proces.
        context = {
            syscall: (name, params) => {
                return new Promise((resolve, reject) => {
                    const id = Math.random();
                    const handler = (e) => {
                        // Filtrăm după tipul corect și după id
                        if (e.data && e.data.type === 'syscall.result' && e.data.id === id) {
                            self.removeEventListener('message', handler);
                            if (e.data.error) {
                                // error: { message, stack }
                                reject(new Error(e.data.error.message || String(e.data.error)));
                            } else {
                                resolve(e.data.result);
                            }
                        }
                    };
                    self.addEventListener('message', handler);

                    self.postMessage({
                        type: 'syscall',
                        pid: __pid,
                        syscall: { id, name, params }
                    });
                });
            },
            stderr,
            stdout,
            exit,
            cwd,
            args
        };

        try {
            // Importăm dinamic logica comenzii.
            const module = await import(logicPath);
            const logicFn = module.default;

            if (typeof logicFn !== 'function') {
                throw new Error(`Command at ${logicPath} does not have a default export or it's not a function.`);
            }

            // Executăm logica și preluăm codul de ieșire.
            const exitCode = await logicFn(args, context);

            // Terminăm procesul (include pid)
            exit(exitCode || 0);

        } catch (err) {
            // Erorile neașteptate sunt trimise la stderr și procesul se încheie cu cod 1.
            stderr.postMessage(err.message || String(err));
            exit(1);
        }
    }
};
