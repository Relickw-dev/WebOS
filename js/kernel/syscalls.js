// File: js/kernel/syscalls.js
import * as vfs from '../vfs/client.js';
import * as terminal from '../terminal.js';

// Obiectul 'handlers' mapează numele syscall-urilor la funcțiile corespunzătoare.
const handlers = {
    // ... (alte handlere precum 'vfs.read', 'vfs.list')
    'vfs.list': (params) => vfs.listFiles(params.path, params.options),
    'vfs.read': (params) => vfs.readFile(params.path),
    
    // --- MODIFICARE CHEIE ---
    // Adaugă acest handler pentru operațiunea de scriere.
    'vfs.write': (params) => vfs.writeFile(params.path, params.content, params.append),
    
    'vfs.mkdir': (params) => vfs.createDirectory(params.path, params.createParents),
    'vfs.rm': (params) => vfs.remove(params.path, params.force, params.recursive),
    'vfs.cp': (params) => vfs.copy(params.source, params.destination, params.recursive),
    'vfs.mv': (params) => vfs.move(params.source, params.destination),
    
    // ... (restul handler-elor pentru terminal)
    'terminal.clear': (params, resolve) => terminal.clear(resolve),
    'terminal.getCwd': (params, resolve) => terminal.getCwd(resolve),
    'terminal.getCommands': (params, resolve) => terminal.getCommands(resolve),
};

// Funcția syscall principală rămâne neschimbată
export async function syscall(name, params) {
    if (handlers[name]) {
        try {
            return await handlers[name](params);
        } catch (e) {
            console.error(`Syscall error in '${name}':`, e);
            throw e;
        }
    } else {
        throw new Error(`Unknown syscall: ${name}`);
    }
}