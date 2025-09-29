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
 * Schimbă directorul curent al terminalului.
 * CORECTURĂ: Am eliminat apelurile la `exit()` și folosim `return`
 * pentru a comunica codul de ieșire, eliminând ambiguitatea.
 * @param {string[]} args - Argumentele comenzii.
 * @param {object} context - Contextul de execuție al procesului.
 * @returns {Promise<number|object>} Exit code (0 sau 1) sau un obiect { new_cwd: '...' } pentru succes.
 */
export default async function cdLogic(args, context) {
    const { syscall, stderr, cwd } = context;

    // 'cd' fără argumente duce la rădăcină.
    if (args.length === 0) {
        // În loc de exit(), returnăm direct obiectul așteptat de terminal.
        return { new_cwd: '/' };
    }

    const targetPath = args[0];
    const newPath = resolvePath(targetPath, cwd);

    try {
        const stats = await syscall('vfs.stat', { path: newPath });
        
        if (stats.type !== 'dir') {
            stderr.postMessage(`cd: not a directory: ${targetPath}\n`);
            return 1; // Returnăm codul de eroare.
        }

        // Succes: Returnăm noua cale.
        return { new_cwd: newPath };

    } catch (e) {
        // Orice eroare de la syscall (ex: calea nu există) este prinsă aici.
        stderr.postMessage(`cd: no such file or directory: ${targetPath}\n`);
        return 1; // Returnăm codul de eroare.
    }
}