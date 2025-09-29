// File: js/procs/ps.js

/**
 * Logica pentru comanda 'ps' (process status).
 * @param {string[]} args - Argumentele comenzii (nu sunt folosite momentan).
 * @param {object} context - Contextul procesului.
 * @param {function} context.syscall - Funcția pentru syscalls.
 * @param {MessagePort} context.stdout - Portul de output.
 */
export default async function psLogic(args, context) {
    const { syscall, stdout } = context;

    try {
        const processList = await syscall('proc.list', {});
        
        let output = '  PID\tNAME\t\tSTATUS\n';
        for (const pid in processList) {
            const proc = processList[pid];
            // Formatare simplă pentru aliniere
            const name = proc.name.padEnd(16, ' ');
            output += ` ${proc.pid}\t${name}\t${proc.status}\n`;
        }
        
        stdout.postMessage(output);
    } catch (e) {
        stdout.postMessage({ type: 'error', message: `ps: ${e.message}\n` });
    } finally {
        stdout.close();
    }

    return 0;
}