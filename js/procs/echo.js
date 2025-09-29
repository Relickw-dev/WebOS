// File: js/procs/echo.js

async function main(args, syscall) {
    // Unește toate argumentele cu un spațiu și le trimite la stdout.
    // Adaugă un newline la final pentru a se comporta ca un echo standard.
    // Terminalul va decide dacă acest output ajunge pe ecran sau într-un fișier.
    const output = args.join(' ') + '\n';
    await syscall('stdout', output);
}

export default main;