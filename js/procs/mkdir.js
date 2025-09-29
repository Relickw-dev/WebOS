// File: js/procs/mkdir.js

/**
 * Logica pentru comanda 'mkdir'.
 * @param {string[]} args - Numele directorului de creat.
 * @param {object} context - Contextul procesului.
 * @param {function} context.syscall - Funcția pentru syscalls.
 * @param {MessagePort} context.stdout - Portul de output.
 */
export default async function mkdirLogic(args, context) {
  const { syscall, stdout } = context;

  if (args.length === 0) {
    stdout.postMessage({ type: 'error', message: 'mkdir: missing operand\n' });
    stdout.close();
    return 1;
  }

  try {
    // Poți adăuga suport pentru flag-ul '-p' (createParents) aici
    await syscall('fs.makeDir', { path: args[0], createParents: false });
  } catch (e) {
    stdout.postMessage({ type: 'error', message: `mkdir: cannot create directory '${args[0]}': ${e.message}\n` });
  } finally {
    stdout.close();
  }

  return 0;
}