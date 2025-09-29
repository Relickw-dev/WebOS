// File: js/procs/rm.js

/**
 * Logica pentru comanda 'rm' (remove).
 * @param {string[]} args - Argumentele comenzii (ex: ['-f', 'file.txt']).
 * @param {object} context - Contextul procesului.
 */
export default async function rmLogic(args, context) {
  const { syscall, stdout } = context;

  if (args.length === 0) {
    stdout.postMessage({ type: 'error', message: 'rm: missing operand\n' });
    stdout.close();
    return 1;
  }

  // Parsare simplă pentru flag-ul '-f' (force)
  const force = args.includes('-f');
  const filesToRemove = args.filter(arg => arg !== '-f');

  if (filesToRemove.length === 0) {
    stdout.postMessage({ type: 'error', message: 'rm: missing file operand\n' });
    stdout.close();
    return 1;
  }

  try {
    for (const file of filesToRemove) {
      await syscall('fs.remove', { path: file, force: force });
    }
  } catch (e) {
    stdout.postMessage({ type: 'error', message: `rm: cannot remove '${filesToRemove.join(' ')}': ${e.message}\n` });
  } finally {
    stdout.close();
  }

  return 0;
}