// File: js/procs/cp.js

/**
 * Logica pentru comanda 'cp' (copy).
 * @param {string[]} args - Argumentele comenzii (ex: ['-r', 'src', 'dest']).
 * @param {object} context - Contextul procesului.
 */
export default async function cpLogic(args, context) {
  const { syscall, stdout } = context;

  const recursive = args.includes('-r');
  const paths = args.filter(arg => arg !== '-r');

  if (paths.length !== 2) {
    stdout.postMessage({ type: 'error', message: 'cp: missing file operand\nUsage: cp [-r] <source> <destination>\n' });
    stdout.close();
    return 1;
  }

  const [source, destination] = paths;

  try {
    await syscall('fs.copy', { source, destination, recursive });
  } catch (e) {
    stdout.postMessage({ type: 'error', message: `cp: ${e.message}\n` });
  } finally {
    stdout.close();
  }

  return 0;
}