// File: js/procs/cat.js

/**
 * Logica pentru comanda 'cat'.
 * @param {string[]} args - Argumentele comenzii (ex: ['file.txt']).
 * @param {object} context - Contextul procesului.
 * @param {function} context.syscall - Funcția pentru a apela syscalls.
 * @param {MessagePort} context.stdin - Portul pentru a citi input-ul.
 * @param {MessagePort} context.stdout - Portul pentru a scrie output-ul.
 */
export default async function catLogic(args, context) {
  const { syscall, stdin, stdout } = context;

  // Funcție pentru a procesa și trimite conținutul
  const processContent = (content) => {
    stdout.postMessage(String(content));
  };

  try {
    if (args.length > 0) {
      // Citește din fișierele specificate în argumente
      for (const file of args) {
        const result = await syscall('fs.readFile', { path: file });
        processContent(result.content);
      }
    } else {
      // Citește din stdin dacă nu sunt specificate fișiere
      stdin.onmessage = (e) => {
        if (e.data.type === 'error') {
            stdout.postMessage(e.data);
        } else {
            processContent(e.data);
        }
      };
      // Așteaptă ca stdin să fie închis de procesul anterior
    }
  } catch (e) {
    const errorMsg = `cat: ${e.message}\n`;
    stdout.postMessage({ type: 'error', message: errorMsg });
  } finally {
    // Dacă am citit din fișiere, închidem stdout imediat.
    // Dacă citim din stdin, așteptăm ca celălalt capăt să închidă conexiunea.
    if (args.length > 0) {
      stdout.close();
    }
  }

  return 0; // Exit code
}