// File: js/kernel/core.js

import { log } from '../utils/logger.js';
import * as vfs from '../vfs/client.js';

let processTable = {};
let nextPid = 1;
const waiters = {}; // pid -> [resolve,...]
const eventHandlers = {};

/**
 * Emite un eveniment (apelează un syscall) și returnează o promisiune
 * care se va rezolva cu rezultatul handler-ului.
 * @param {string} eventName - Numele syscall-ului (ex: 'fs.readFile').
 * @param {object} params - Parametrii pentru syscall.
 * @returns {Promise<any>}
 */
export function emit(eventName, params) {
  return new Promise((resolve, reject) => {
    const handler = eventHandlers[eventName];
    if (handler) {
      try {
        // Handler-ul primește parametrii și funcțiile de rezolvare/respingere
        handler(params, resolve, reject);
      } catch (e) {
        log('error', `Syscall handler for ${eventName} failed: ${e.message}`);
        reject(e);
      }
    } else {
      const errorMsg = `No handler for syscall ${eventName}`;
      log('error', errorMsg);
      reject(new Error(errorMsg));
    }
  });
}

/**
 * Înregistrează un handler pentru un syscall specific.
 * @param {string} eventName - Numele syscall-ului.
 * @param {function} handler - Funcția care va gestiona apelul.
 */
export function on(eventName, handler) {
  eventHandlers[eventName] = handler;
  log('info', `Registered handler for syscall ${eventName}`);
}

export function initKernel() {
  processTable = {};
  nextPid = 1;
  for (const k in waiters) delete waiters[k];
  for (const k in eventHandlers) delete eventHandlers[k];
  log('info', 'Kernel initialized');
}

/**
 * Modificat pentru a lansa un Web Worker.
 * @param {object} params
 * @param {string} params.name - Numele procesului.
 * @param {string} params.logicPath - Calea către fișierul JS cu logica procesului.
 * @param {Array} params.args - Argumentele pentru proces.
 * @param {number} [params.ppid=0] - Parent Process ID.
 * @param {object} [params.meta={}] - Metadate.
 */
export function spawnProcess({ name = 'proc', ppid = 0, args = [], logicPath = null, meta = {} }) {
  if (!logicPath) {
    throw new Error("spawnProcess requires a 'logicPath' to the worker script.");
  }

  const pid = nextPid++;
  // Creăm un nou Worker. Acesta este momentul în care procesul este "creat".
  const worker = new Worker('/js/kernel/process_worker.js', { type: 'module' });

  const proc = {
    pid,
    ppid,
    name,
    args,
    status: 'created',
    startTime: Date.now(),
    endTime: null,
    exitCode: null,
    cpuTicks: 0,
    worker, // Stocăm referința la worker
    meta,
  };
  processTable[pid] = proc;

  // --- KERNEL-UL ASCULTĂ MESAJE DE LA PROCES (WORKER) ---
  worker.onmessage = (e) => {
    const { type, ...data } = e.data;
    switch (type) {
      // 1. Procesul a cerut un apel de sistem
      case 'syscall':
        emit(data.name, data.params)
          .then(result => {
            // Trimitem rezultatul înapoi la worker
            worker.postMessage({ type: 'syscall_result', callId: data.callId, result });
          })
          .catch(error => {
            // Trimitem eroarea înapoi la worker
            worker.postMessage({ type: 'syscall_error', callId: data.callId, error: error.message });
          });
        break;
      
      // 2. Procesul s-a terminat normal
      case 'exit':
        exitProcess(pid, data.code);
        break;

      // 3. Procesul a crăpat (a avut o eroare neprinsă)
      case 'error':
        log('error', `proc ${pid} crashed: ${data.message}`);
        exitProcess(pid, 1); // Cod de ieșire generic pentru eroare
        break;
    }
  };

  // --- KERNEL-UL TRIMITE MESAJUL DE INIȚIALIZARE PROCESULUI ---
  worker.postMessage({
    type: 'init',
    pid: pid,
    args: args,
    logicPath: logicPath, // Trimitem calea către logica pe care trebuie să o încarce
  });
  
  proc.status = 'running'; // Procesul rulează imediat ce worker-ul pornește
  log('info', `spawned worker for pid=${pid} name=${proc.name}`);
  return proc;
}

export function getProcess(pid) {
  return processTable[pid] || null;
}

export function listProcesses() {
  // Returnează o copie a tabelului de procese, fără referința la worker
  const plainProcessTable = {};
  for(const pid in processTable) {
    const { worker, ...procDetails } = processTable[pid];
    plainProcessTable[pid] = procDetails;
  }
  return plainProcessTable;
}

export function exitProcess(pid, code = 0) {
  const proc = processTable[pid];
  if (!proc || proc.status === 'done' || proc.status === 'killed') return false;
  
  proc.worker.terminate(); // Oprim worker-ul!
  
  proc.status = 'done';
  proc.exitCode = code;
  proc.endTime = Date.now();

  if (waiters[pid]) {
    for (const res of waiters[pid]) res({ pid, exitCode: code });
    delete waiters[pid];
  }
  log('info', `process ${pid} exited code=${code}`);
  return true;
}

export function killProcess(pid, signalCode = 9) {
    const proc = processTable[pid];
    if (!proc) return false;
    
    proc.worker.terminate(); // Oprim worker-ul!

    proc.status = 'killed';
    proc.exitCode = 128 + signalCode;
    proc.endTime = Date.now();
    if (waiters[pid]) {
        for (const res of waiters[pid]) res({ pid, exitCode: proc.exitCode });
        delete waiters[pid];
    }
    log('warn', `process ${pid} killed (signal=${signalCode})`);
    return true;
}

export function waitForExit(pid) {
  const proc = processTable[pid];
  if (!proc) return Promise.reject(new Error('No such process'));
  if (proc.status === 'done' || proc.status === 'killed') {
    return Promise.resolve({ pid, exitCode: proc.exitCode });
  }
  return new Promise(resolve => {
    if (!waiters[pid]) waiters[pid] = [];
    waiters[pid].push(resolve);
  });
}

// Funcționalitatea de semnale trebuie regândită într-un model cu workers,
// deocamdată o lăsăm schelet.
export function sendSignal(pid, sig) {
    const proc = getProcess(pid);
    if (!proc) return false;
    // Într-o implementare viitoare, am trimite un mesaj worker-ului
    log('warn', `Signal handling for workers is not fully implemented. (PID: ${pid}, Signal: ${sig})`);
    if (sig === 'SIGKILL') {
        killProcess(pid, 9);
    }
    return true;
}

/**
 * Înregistrează toți handler-ii pentru apelurile de sistem.
 */
export function setupProcessHandlers() {
  // === HANDLERE PROCESE (proc.*) ===

  on('proc.spawn', (params, resolve, reject) => {
      try {
          const proc = spawnProcess(params);
          // Rezolvăm cu o versiune "simplificată" a obiectului proces, fără worker
          const { worker, ...procDetails } = proc;
          resolve(procDetails);
      } catch (e) {
          reject(e);
      }
  });

  on('proc.list', (params, resolve) => resolve(listProcesses()));
  on('proc.kill', (params, resolve) => resolve(killProcess(params.pid)));
  on('proc.wait', (params, resolve) => waitForExit(params.pid).then(resolve));
  on('proc.sendSignal', (params, resolve) => resolve(sendSignal(params.pid, params.signal)));

  // === HANDLERE SISTEM DE FIȘIERE (fs.*) ===
  on('fs.readDir', async (params, resolve, reject) => {
      try {
          resolve(await vfs.readDir(params.path, params.options || {}));
      } catch (e) { reject(e); }
  });
  
  on('fs.readFile', async (params, resolve, reject) => {
      try {
          resolve(await vfs.readFile(params.path));
      } catch (e) { reject(e); }
  });

  on('fs.writeFile', async (params, resolve, reject) => {
      try {
          resolve(await vfs.writeFile(params.path, params.content, params.append));
      } catch (e) { reject(e); }
  });
  
  on('fs.makeDir', async (params, resolve, reject) => {
      try {
          resolve(await vfs.mkdir(params.path, params.createParents));
      } catch (e) { reject(e); }
  });

  on('fs.remove', async (params, resolve, reject) => {
      try {
          resolve(await vfs.rm(params.path, params.force));
      } catch (e) { reject(e); }
  });

  on('fs.move', async (params, resolve, reject) => {
      try {
          resolve(await vfs.mv(params.source, params.destination));
      } catch (e) { reject(e); }
  });

  on('fs.copy', async (params, resolve, reject) => {
      try {
          resolve(await vfs.cp(params.source, params.destination, params.recursive));
      } catch (e) { reject(e); }
  });
}