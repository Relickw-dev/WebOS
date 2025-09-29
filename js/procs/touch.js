// File: js/procs/touch.js

/**
 * Logica pentru comanda 'touch'.
 * @param {string[]} args - Numele fișierului.
 * @param {object} context - Contextul procesului.
 * @param {function} context.syscall - Funcția pentru syscalls.
 * @param {MessagePort} context.stdout - Portul de output.
 */
export default async function touchLogic(args, context) {
  const { syscall, stdout } = context;

  if (args.length === 0) {
    stdout.postMessage({ type: 'error', message: 'touch: missing file operand\n' });
    stdout.close();
    return 1;
  }
  
  try {
    // writeFile cu conținut gol funcționează ca 'touch'
    await syscall('fs.writeFile', { path: args[0], content: '' });
  } catch (e) {
    stdout.postMessage({ type: 'error', message: `touch: cannot touch '${args[0]}': ${e.message}\n` });
  } finally {
    stdout.close();
  }
  
  return 0;
}