// File: js/procs/pwd.js

/**
 * Logica pentru comanda 'pwd' (print working directory).
 * @param {string[]} args - Argumente (nefolosite).
 * @param {object} context - Contextul procesului.
 */
export default async function pwdLogic(args, context) {
  const { syscall, stdout } = context;

  try {
    // Acest syscall va trebui implementat în `core.js` și `terminal.js`
    const cwd = await syscall('terminal.getCwd');
    stdout.postMessage(cwd + '\n');
  } catch (e) {
    stdout.postMessage({ type: 'error', message: `pwd: ${e.message}\n` });
  } finally {
    stdout.close();
  }

  return 0;
}