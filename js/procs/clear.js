// File: js/procs/clear.js

/**
 * Logica pentru comanda 'clear'.
 * @param {string[]} args - Argumente (nefolosite).
 * @param {object} context - Contextul procesului.
 */
export default async function clearLogic(args, context) {
  const { syscall, stdout } = context;

  try {
    // Acest syscall va trebui implementat în `core.js` și `terminal.js`
    await syscall('terminal.clear');
  } catch (e) {
    // Nu trimitem eroare la stdout, deoarece ecranul oricum ar fi curat
  } finally {
    stdout.close();
  }

  return 0;
}