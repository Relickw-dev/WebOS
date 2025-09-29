// File: js/procs/touch.js
async function main(args, syscall) {
    if (args.length === 0) {
        await syscall('stderr', 'touch: missing file operand');
        return;
    }

    const path = args[0];

    try {
        // Logica de 'touch' este să creeze un fișier gol sau să-i actualizeze timestamp-ul.
        // Aici, vom scrie un conținut gol, ceea ce are efectul dorit.
        await syscall('vfs.write', { path, content: '', append: false });
    } catch (e) {
        await syscall('stderr', `touch: ${path}: ${e.message}`);
    }
}

export default main;