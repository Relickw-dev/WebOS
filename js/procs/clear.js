// File: js/procs/clear.js

async function main(args, syscall) {
    // Apelăm syscall-ul 'terminal.clear', care este gestionat direct de terminal.js.
    // Acesta va goli conținutul elementului HTML al terminalului.
    await syscall('terminal.clear');
}

export default main;