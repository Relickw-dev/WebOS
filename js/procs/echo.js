// File: js/procs/echo.js

/**
 * Logica pentru comanda 'echo'.
 * @param {string[]} args - Argumentele de afișat.
 * @param {object} context - Contextul procesului.
 * @param {MessagePort} context.stdout - Portul pentru a scrie output-ul.
 */
export default async function echoLogic(args, context) {
  const { stdout } = context;
  
  // Concatenează argumentele și adaugă un newline la final
  const output = args.join(' ') + '\n';
  
  stdout.postMessage(output);
  stdout.close();
  
  return 0; // Exit code
}