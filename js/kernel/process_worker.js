// File: js/kernel/process_worker.js

let context = {};

// Funcția 'exit' poate fi apelată de procese pentru a se termina.
const exit = (exitCode = 0) => {
    self.postMessage({ type: 'exit', code: exitCode });
};

// Handler pentru mesajele primite de la kernel (thread-ul principal).
self.onmessage = async (e) => {
    const { logicPath, args, cwd } = e.data;

    // Stream-urile stderr/stdout sunt simple proxy-uri către thread-ul principal.
    const stderr = { postMessage: (data) => self.postMessage({ type: 'stderr', data }) };
    const stdout = { postMessage: (data) => self.postMessage({ type: 'stdout', data }) };

    // Construim contextul de execuție pentru proces.
    context = {
        syscall: (name, params) => {
            return new Promise((resolve, reject) => {
                const id = Math.random();
                const handler = (e) => {
                    if (e.data.id === id) {
                        self.removeEventListener('message', handler);
                        if (e.data.error) {
                            reject(new Error(e.data.error));
                        } else {
                            resolve(e.data.result);
                        }
                    }
                };
                self.addEventListener('message', handler);
                self.postMessage({ type: 'syscall', name, params, id });
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

        // --- ÎNCEPUT MODIFICARE CRITICĂ ---

        // Executăm logica și preluăm codul de ieșire (care poate fi un număr sau un obiect).
        const exitCode = await logicFn(args, context);
        
        // Trimităm explicit un mesaj de 'exit' cu codul primit.
        // Aceasta este veriga lipsă care rezolvă problema de "freeze".
        self.postMessage({ type: 'exit', code: exitCode });

        // --- SFÂRȘIT MODIFICARE CRITICĂ ---

    } catch (err) {
        // Erorile neașteptate sunt trimise la stderr și procesul se încheie cu cod 1.
        stderr.postMessage(err.message);
        exit(1);
    }
};