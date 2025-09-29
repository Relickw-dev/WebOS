// File: js/procs/cd.js

/**
 * Rezolvă o cale țintă relativă la o cale de bază.
 * Gestionează '.', '..', și căile absolute.
 * @param {string} target - Calea de navigat (ex: '../docs', '/home').
 * @param {string} base - Directorul curent (ex: '/usr/bin').
 * @returns {string} Calea absolută, normalizată.
 */
function resolvePath(target, base) {
    // Căile absolute pornesc de la rădăcină.
    const baseParts = base === '/' ? [] : base.split('/').filter(p => p);
    const targetParts = target.split('/').filter(p => p);

    let parts = target.startsWith('/') ? [] : baseParts;

    for (const part of targetParts) {
        if (part === '..') {
            if (parts.length > 0) {
                parts.pop();
            }
        } else if (part !== '.') {
            parts.push(part);
        }
    }
    
    return '/' + parts.join('/');
}

/**
 * Logica pentru comanda 'cd' (change directory).
 * Schimbă directorul curent al terminalului, având o structură similară cu 'cat.js'.
 * @param {string[]} args - Argumentele comenzii. Primul argument este calea țintă.
 * @param {object} context - Contextul de execuție al procesului.
 * @param {function} context.syscall - Funcția pentru a apela syscalls.
 * @param {MessagePort} context.stderr - Portul pentru a scrie erorile.
 * @param {function} context.exit - Funcția pentru a termina procesul.
 * @param {string} context.cwd - Directorul de lucru curent.
 * @returns {Promise<number>} Exit code (0 pentru succes, 1 pentru eroare).
 */
export default async function cdLogic(args, context) {
    const { syscall, stderr, exit, cwd } = context;

    // 'cd' fără argumente este tratat ca un succes, ducând la '/'.
    if (args.length === 0) {
        exit({ new_cwd: '/' });
        return 0;
    }

    const targetPath = args[0];
    const newPath = resolvePath(targetPath, cwd);

    try {
        const stats = await syscall('vfs.stat', { path: newPath });
        
        if (stats.type !== 'dir') {
            stderr.postMessage(`cd: not a directory: ${targetPath}\n`);
            return 1; // Cod de ieșire pentru eroare
        }

        // Succes: Trimitem noua cale și ieșim cu codul 0.
        exit({ new_cwd: newPath });
        return 0; // Cod de ieșire pentru succes

    } catch (e) {
        // Orice eroare de la syscall (ex: calea nu există) este prinsă aici.
        stderr.postMessage(`cd: no such file or directory: ${targetPath}\n`);
        return 1; // Cod de ieșire pentru eroare
    }
}