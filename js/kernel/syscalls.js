// File: js/kernel/syscalls.js
import { on } from './core.js';
import * as vfs from '../vfs/client.js';

const syscallHandlers = {
    'vfs.read': vfs.readFile,
    'vfs.write': vfs.writeFile,
    'vfs.stat': vfs.stat,
    'vfs.mkdir': vfs.mkdir,
    'vfs.readdir': vfs.readDir,
    'vfs.rm': vfs.remove,
    'vfs.cp': vfs.cp,
    'vfs.mv': vfs.mv,
};

export function registerSyscall(name, handler) {
    if (syscallHandlers[name]) {
        console.warn(`Syscall ${name} is already registered. Overwriting.`);
    }
    syscallHandlers[name] = handler;
}

export function syscall(name, params) {
    if (syscallHandlers[name]) {
        // Păstrăm standardizarea de a pasa un singur obiect 'params'
        return syscallHandlers[name](params);
    }
    return Promise.reject(new Error(`Syscall not found: ${name}`));
}


// --- MODIFICARE CRITICĂ ---
// Am mutat logica de înregistrare a evenimentului în funcția de inițializare
// pentru a evita erorile de încărcare a modulelor.
export function initSyscalls() {
    // Înregistrăm handler-ul principal pentru toate syscall-urile.
    // Acum este înconjurat de 'async' și folosește 'await' pentru a gestiona corect
    // funcțiile asincrone (cum sunt toate cele din VFS).
    on('syscall', async ({ name, params, process }, resolve, reject) => {
        try {
            const handler = syscallHandlers[name];
            if (!handler) {
                throw new Error(`Unknown syscall: ${name}`);
            }
            // Așteptăm rezultatul, deoarece funcțiile VFS returnează promisiuni.
            const result = await handler(params, process);
            resolve(result);
        } catch (e) {
            reject(e.message);
        }
    });
}