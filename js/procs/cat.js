// File: js/procs/cat.js

// CORECTURĂ: Am șters "import { syscall } from '../kernel/syscalls.js';"
// Procesul primește obiectul `syscall` ca argument, nu trebuie să-l importe.

async function main(args, syscall) { // CORECTURĂ: Am adăugat 'syscall' ca al doilea argument
    // Verificare de siguranță
    if (!syscall) {
        // Nu putem face nimic fără syscall, nici măcar să raportăm o eroare.
        console.error("Eroare critică: Obiectul syscall nu a fost furnizat procesului 'cat'.");
        return; 
    }

    if (args.length === 0) {
        await syscall('stderr', 'cat: missing operand');
        return;
    }

    for (const path of args) {
        try {
            // Folosim obiectul syscall primit ca argument
            const data = await syscall('vfs.read', { path });
            await syscall('stdout', data);
        } catch (e) {
            await syscall('stderr', `cat: ${path}: ${e.message}`);
        }
    }
}

export default main;