// File: js/kernel/scheduler.js
import * as core from './core.js';
import { log } from '../utils/logger.js';
import { TICK_MS } from '../config.js';

let tickInterval = null;
const runQueue = []; // pid queue

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

async function dispatch() {
  if (runQueue.length === 0) return;
  const pid = runQueue.shift();
  const proc = core.getProcess(pid);
  if (!proc) return;
  try {
    // mark running
    proc.status = 'running';
    proc.cpuTicks = (proc.cpuTicks || 0) + 1;
    if (!proc.startTime) proc.startTime = Date.now();

    // prepare cooperative context
    const ctx = createContext(proc);

    if (proc.logic && typeof proc.logic === 'function') {
      // run logic; if it throws -> exit with code 1
      const result = await proc.logic(proc.args, ctx);
      // if process hasn't been killed already
      if (!proc.cancelled && (proc.status !== 'done' && proc.status !== 'killed')) {
        core.exitProcess(pid, typeof result === 'number' ? result : 0);
      }
    } else {
      // no logic -> immediate exit 0
      core.exitProcess(pid, 0);
    }
  } catch (e) {
    log('error', `proc ${pid} failed: ${e.message}`);
    core.exitProcess(pid, 1);
  }
}

function createContext(proc) {
  const handlers = new Map();
  return {
    pid: proc.pid,
    ppid: proc.ppid,
    meta: proc.meta || {},
    // stdin/stdout handled by proc.pipeline logic in syscalls
    onSignal(sig, cb) {
      if (typeof cb === 'function') {
        handlers.set(sig, cb);
        // register at core-level as well so external sendSignal can invoke
        core.registerSignalHandler(proc.pid, sig, cb);
      }
    },
    isCancelled() { return !!core.getProcess(proc.pid)?.cancelled; },
    // allow checking queued signals
    drainSignals() {
      const p = core.getProcess(proc.pid);
      const q = p ? (p.signalQueue.splice(0, p.signalQueue.length)) : [];
      return q;
    }
  };
}
