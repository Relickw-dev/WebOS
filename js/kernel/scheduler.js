// File: js/kernel/scheduler.js
import * as core from './core.js';
import { log } from '../utils/logger.js';
import { TICK_MS } from '../config.js';

let tickInterval = null;
const runQueue = []; // Coada de procese (PID-uri) care trebuie rulate

export function startScheduler() {
  if (tickInterval) return;
  tickInterval = setInterval(dispatch, TICK_MS);
  log('info', 'Scheduler started');
}

export function stopScheduler() {
  if (!tickInterval) return;
  clearInterval(tickInterval);
  tickInterval = null;
  log('info', 'Scheduler stopped');
}

export function enqueue(proc) {
  if (!proc || !proc.pid) return;
  runQueue.push(proc.pid);
  const p = core.getProcess(proc.pid);
  if (p) p.status = 'queued';
}

/**
 * Funcția centrală a scheduler-ului. Rulează o "felie" dintr-un proces.
 */
async function dispatch() {
  if (runQueue.length === 0) return;

  const pid = runQueue.shift();
  const proc = core.getProcess(pid);

  // Verificări de siguranță
  if (!proc || proc.status === 'killed' || proc.status === 'done') {
    return;
  }

  try {
    proc.status = 'running';
    proc.cpuTicks = (proc.cpuTicks || 0) + 1;
    if (!proc.startTime) proc.startTime = Date.now();

    // Dacă procesul nu are un iterator, înseamnă că rulează pentru prima dată.
    // Inițializăm generatorul.
    if (!proc.iterator) {
      if (typeof proc.logic !== 'function') {
        throw new Error('Process logic is not a function.');
      }
      const ctx = createContext(proc);
      proc.iterator = proc.logic(proc.args, ctx);
    }
    
    // Rulăm următoarea bucată de cod a procesului, până la următorul `yield`.
    const result = await proc.iterator.next();

    // Verificăm dacă generatorul s-a terminat.
    if (result.done) {
      // Dacă da, procesul s-a încheiat. Îl scoatem din sistem.
      core.exitProcess(pid, typeof result.value === 'number' ? result.value : 0);
    } else {
      // Dacă nu, procesul a cedat controlul (`yield`).
      // Îl punem înapoi în coadă pentru a fi reluat mai târziu.
      proc.status = 'queued';
      runQueue.push(pid);
    }

  } catch (e) {
    log('error', `proc ${pid} failed: ${e.message}`);
    core.exitProcess(pid, 1); // Încheiem procesul cu cod de eroare
  }
}

function createContext(proc) {
  const handlers = new Map();
  return {
    pid: proc.pid,
    ppid: proc.ppid,
    meta: proc.meta || {},
    onSignal(sig, cb) {
      if (typeof cb === 'function') {
        handlers.set(sig, cb);
        core.registerSignalHandler(proc.pid, sig, cb);
      }
    },
    isCancelled() { return !!core.getProcess(proc.pid)?.cancelled; },
    drainSignals() {
      const p = core.getProcess(proc.pid);
      const q = p ? (p.signalQueue.splice(0, p.signalQueue.length)) : [];
      return q;
    },
    // NOU: Funcție ajutătoare pentru a ceda controlul
    yield: () => new Promise(resolve => setTimeout(resolve, 0)),
  };
}