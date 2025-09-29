// File: js/procs/ls.js

/**
 * Logica pentru comanda 'ls'.
 * @param {string[]} args - Argumentele comenzii (ex: ['-l', '/path/to/dir']).
 * @param {object} context - Contextul procesului.
 * @param {function} context.syscall - Funcția pentru a apela syscalls.
 * @param {MessagePort} context.stdout - Portul pentru a scrie output-ul.
 */
export default async function lsLogic(args, context) {
  const { syscall, stdout } = context;
  let path = '.';
  // Aici poți adăuga parsare de argumente mai complexă (ex: -l, -a)
  if (args.length > 0) {
    path = args[0];
  }

  try {
    const entries = await syscall('fs.readDir', { path });
    const output = entries.map(e => (typeof e === 'object' ? e.name : e)).join('\n') + '\n';
    
    // Trimite output-ul prin portul stdout
    stdout.postMessage(output);
  } catch (e) {
    // Trimite eroarea prin stdout (ideal ar fi un stderr separat)
    const errorMsg = `ls: cannot access '${path}': ${e.message}\n`;
    stdout.postMessage({ type: 'error', message: errorMsg });
  } finally {
    // Închide portul pentru a semnala sfârșitul stream-ului
    stdout.close();
  }
  
  return 0; // Exit code
}