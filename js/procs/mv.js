// File: js/procs/mv.js

/**
 * Logica pentru comanda 'mv' (move).
 * @param {string[]} args - Argumentele comenzii (ex: ['old_name', 'new_name']).
 * @param {object} context - Contextul procesului.
 */
export default async function mvLogic(args, context) {
  const { syscall, stdout } = context;

  if (args.length !== 2) {
    stdout.postMessage({ type: 'error', message: 'mv: missing file operand\nUsage: mv <source> <destination>\n' });
    stdout.close();
    return 1;
  }

  const [source, destination] = args;

  try {
    await syscall('fs.move', { source, destination });
  } catch (e) {
    stdout.postMessage({ type: 'error', message: `mv: ${e.message}\n` });
  } finally {
    stdout.close();
  }

  return 0;
}