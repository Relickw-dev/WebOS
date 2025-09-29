// File: js/kernel/process_worker.js

let pid = -1;
let args = [];
let logic = null; // Funcția logică a procesului
let syscallCounter = 0;
const pendingSyscalls = new Map();

/**
 * Trimite un apel de sistem (syscall) către kernel și returnează o promisiune
 * care se va rezolva cu rezultatul.
 * @param {string} name Numele syscall-ului (ex: 'fs.readFile')
 * @param {object} params Parametrii pentru syscall
 * @returns {Promise<any>}
 */
function syscall(name, params) {
  return new Promise((resolve, reject) => {
    const callId = syscallCounter++;
    pendingSyscalls.set(callId, { resolve, reject });
    // Trimitem mesajul către Kernel (thread-ul principal)
    postMessage({
      type: 'syscall',
      callId: callId,
      name: name,
      params: params
    });
  });
}

// Ascultă mesajele venite de la Kernel
self.onmessage = async (e) => {
  const { type, ...data } = e.data;

  switch (type) {
    // 1. Mesaj de inițializare trimis de kernel la crearea procesului
    case 'init':
      pid = data.pid;
      args = data.args;
      // Încarcă dinamic logica specifică acestui proces
      try {
        const module = await import(data.logicPath);
        if (typeof module.default !== 'function') {
          throw new Error(`Logic file ${data.logicPath} does not have a default export function.`);
        }
        logic = module.default;
        // Odată inițializat, pornește execuția
        executeLogic();
      } catch (err) {
        // Raportează o eroare fatală la încărcare
        postMessage({ type: 'error', message: `Failed to load logic from ${data.logicPath}: ${err.message}` });
        self.close(); // Închide worker-ul
      }
      break;

    // 2. Răspuns la un syscall anterior
    case 'syscall_result':
      if (pendingSyscalls.has(data.callId)) {
        pendingSyscalls.get(data.callId).resolve(data.result);
        pendingSyscalls.delete(data.callId);
      }
      break;
      
    // 3. Eroare la un syscall anterior
    case 'syscall_error':
      if (pendingSyscalls.has(data.callId)) {
        pendingSyscalls.get(data.callId).reject(new Error(data.error));
        pendingSyscalls.delete(data.callId);
      }
      break;
  }
};

/**
 * Execută logica principală a procesului.
 */
async function executeLogic() {
  if (!logic) return;

  // Cream un context simplificat pentru proces, conținând doar syscall-ul.
  const context = { syscall };
  
  try {
    const exitCode = await logic(args, context);
    // Trimite mesaj de finalizare cu succes
    postMessage({ type: 'exit', code: exitCode || 0 });
  } catch (err) {
    // Trimite mesaj de eroare/crash
    postMessage({ type: 'error', message: err.message });
  } finally {
    self.close(); // Asigură-te că worker-ul se închide
  }
}