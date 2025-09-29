// File: js/procs/rm.js

async function main(args, syscall) {
    if (args.length === 0) {
        await syscall('stderr', 'rm: missing operand');
        return;
    }

    const options = args.filter(arg => arg.startsWith('-'));
    const paths = args.filter(arg => !arg.startsWith('-'));

    if (paths.length === 0) {
        await syscall('stderr', 'rm: missing file operand');
        return;
    }
    
    const recursive = options.join('').includes('r');
    const force = options.join('').includes('f');

    for (const path of paths) {
        try {
            // --- DEBUG ---
            // Verificăm că ajungem aici și ce parametri trimitem.
            console.log(`[DEBUG] Procesul rm.js apelează syscall('vfs.rm') pentru calea: '${path}'`);
            await syscall('vfs.rm', { path, force, recursive });
        } catch (e) {
            await syscall('stderr', `rm: cannot remove '${path}': ${e.message}`);
        }
    }
}

export default main;