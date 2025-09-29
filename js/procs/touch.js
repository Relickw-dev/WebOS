// File: js/procs/touch.js

async function main(args, syscall) {
    // Verificăm dacă a fost furnizat măcar un nume de fișier.
    if (args.length === 0) {
        await syscall('stderr', 'touch: missing file operand');
        return;
    }

    // Extragem argumentele pe care le primim de la terminal.
    // args[0] este calea fișierului (ex: 'fisier.txt').
    // args[1] este conținutul de scris (ex: 'textul meu\n'). Dacă nu există, e un string gol.
    // args[2] este un boolean care ne spune dacă să adăugăm (true) sau să suprascriem (false).
    const path = args[0];
    const content = args[1] || '';
    const append = args[2] === true; // 'true' pentru '>>', 'false' pentru '>'

    try {
        // Apelăm "system call"-ul de scriere cu toți parametrii necesari.
        // Acum, serverul va primi și conținutul, nu doar numele fișierului.
        await syscall('vfs.write', { path, content, append });
    } catch (e) {
        await syscall('stderr', `touch: ${path}: ${e.message}`);
    }
}

export default main;