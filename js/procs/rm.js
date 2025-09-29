// File: js/procs/rm.js

async function main(args, syscall) {
    // Verificăm dacă nu avem argumente.
    if (args.length === 0) {
        await syscall('stderr', 'rm: missing operand');
        return;
    }

    // --- MODIFICARE CHEIE ---
    // Parsăm argumentele pentru a găsi opțiunile și fișierele.
    const options = args.filter(arg => arg.startsWith('-'));
    const paths = args.filter(arg => !arg.startsWith('-'));

    // Verificăm dacă a fost furnizată măcar o cale de fișier.
    if (paths.length === 0) {
        await syscall('stderr', 'rm: missing file operand');
        return;
    }
    
    // Verificăm dacă opțiunile sunt valide (acceptăm -r, -f, -rf, -fr).
    const recursive = options.join('').includes('r');
    const force = options.join('').includes('f');

    // Iterăm prin fiecare cale și o ștergem.
    for (const path of paths) {
        try {
            await syscall('vfs.rm', { path, force, recursive });
        } catch (e) {
            // Trimitem eroarea la stderr pentru a fi afișată în terminal.
            await syscall('stderr', `rm: cannot remove '${path}': ${e.message}`);
        }
    }
}

export default main;