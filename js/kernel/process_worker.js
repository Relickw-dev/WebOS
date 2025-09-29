// File: js/kernel/process_worker.js

let pid;
// Am eliminat 'syscall' ca variabilă globală pentru a evita confuziile.

/**
 * Gestionează comunicarea cu kernel-ul (core.js).
 * 'init': Pornește un nou proces, setând mediul de execuție.
 * 'syscall.result': Primește rezultatul unui apel de sistem asincron.
 */
self.onmessage = async (e) => {
    const { type, ...data } = e.data;

    if (type === 'init') {
        pid = data.pid;
        const { proc, cwd } = data;
        
        // Creează interfața de syscalls pentru acest proces.
        const syscallInterface = createSyscallInterface(pid);
        
        // Funcția 'exit' pe care procesul o va apela pentru a se încheia.
        const exit = (exitCode) => {
            self.postMessage({ type: 'proc.exit', pid, exitCode });
        };
        
        try {
            // Importă dinamic modul cu logica procesului.
            const module = await import(proc.logicPath);
            const procLogic = module.default;

            // Creează contextul complet care va fi pasat procesului.
            const context = {
                syscall: syscallInterface,
                // Simulăm postMessage pentru stdout/stderr, direcționându-le printr-un syscall.
                stdout: { postMessage: (d) => syscallInterface('stdout', d) },
                stderr: { postMessage: (d) => syscallInterface('stderr', d) },
                exit: exit,
                cwd: cwd
            };
            
            // Apelează logica principală a procesului și așteaptă codul de ieșire.
            const exitCode = await procLogic(proc.args, context);
            
            // La final, apelăm 'exit' cu codul returnat sau 0 ca default.
            exit(exitCode !== undefined ? exitCode : 0);

        } catch (error) {
            // Trimite mesaj de eroare critică (crash) înapoi la kernel.
            self.postMessage({ type: 'proc.crash', pid, error: { message: error.message, stack: error.stack } });
        }

    } else if (type === 'syscall.result') {
        // Răspunsul de la kernel a sosit, pasează-l handler-ului.
        // Accesăm handler-ul prin intermediul interfeței.
        syscall.handleResult(data);
    }
};

// Declarăm 'syscall' aici pentru a fi accesibil global în worker,
// în special pentru handler-ul de 'syscall.result'.
const syscall = createSyscallInterface(pid);

/**
 * Creează și returnează funcțiile pe care un proces le poate folosi
 * pentru a comunica cu kernel-ul.
 */
function createSyscallInterface(processId) {
    let nextSyscallId = 0;
    const pendingSyscalls = new Map();

    const syscallFunction = (name, params) => {
        return new Promise((resolve, reject) => {
            const id = nextSyscallId++;
            pendingSyscalls.set(id, { resolve, reject });
            self.postMessage({
                type: 'syscall',
                pid: processId,
                syscall: { id, name, params }
            });
        });
    };

    syscallFunction.handleResult = ({ id, result, error }) => {
        const promise = pendingSyscalls.get(id);
        if (promise) {
            if (error) {
                const err = new Error(error.message);
                err.stack = error.stack; 
                promise.reject(err);
            } else {
                promise.resolve(result);
            }
            pendingSyscalls.delete(id);
        }
    };

    return syscallFunction;
}