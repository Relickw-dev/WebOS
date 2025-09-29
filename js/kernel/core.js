// File: js/kernel/core.js
import { log } from '../utils/logger.js';

let processTable = {};
let nextPid = 1;
const waiters = {}; // pid -> [resolve,...]

export function initKernel() {
  processTable = {};
  nextPid = 1;
  for (const k in waiters) delete waiters[k];
  log('info', 'Kernel initialized');
}

export function spawnProcess({ name='proc', ppid = 0, args=[], logic = null, meta = {} }) {
  const pid = nextPid++;
  const proc = {
    pid,
    ppid,
    name,
    args,
    status: 'created',
    startTime: null,
    endTime: null,
    exitCode: null,
    cpuTicks: 0,
    logic,
    meta,
    signalHandlers: {}, // name -> handler fn
    signalQueue: [],
    cancelled: false,
  };
  processTable[pid] = proc;
  log('info', `spawned ${pid} ${proc.name} ${proc.args.join(' ')}`);
  return proc;
}

export function getProcess(pid) {
  return processTable[pid] || null;
}

export function listProcesses() {
  return JSON.parse(JSON.stringify(processTable));
}

export function exitProcess(pid, code = 0) {
  const proc = processTable[pid];
  if (!proc) return false;
  proc.status = 'done';
  proc.exitCode = code;
  proc.endTime = Date.now();
  // resolve waiters
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
  proc.status = 'killed';
  proc.exitCode = 128 + (signalCode || 9);
  proc.endTime = Date.now();
  proc.cancelled = true;
  if (waiters[pid]) {
    for (const res of waiters[pid]) res({ pid, exitCode: proc.exitCode });
    delete waiters[pid];
  }
  log('warn', `process ${pid} killed (signal=${signalCode})`);
  return true;
}

// event-based wait
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

// signal sending: supports SIGINT, SIGTERM
export function sendSignal(pid, sig) {
  const proc = processTable[pid];
  if (!proc) return false;
  // If handler registered, queue and call handler if present
  proc.signalQueue.push(sig);
  const handler = proc.signalHandlers[sig];
  if (typeof handler === 'function') {
    try {
      handler(sig);
    } catch (e) {
      log('error', `signal handler for ${pid} threw: ${e.message}`);
    }
  } else {
    // default actions
    if (sig === 'SIGTERM' || sig === 'SIGKILL') {
      killProcess(pid, sig === 'SIGKILL' ? 9 : 15);
      return true;
    }
    if (sig === 'SIGINT') {
      // attempt graceful interrupt: mark canceled; logic may check context.isCancelled()
      proc.cancelled = true;
      // if no handler, kill as fallback
      killProcess(pid, 2);
      return true;
    }
  }
  return true;
}

export function registerSignalHandler(pid, sigName, handler) {
  const proc = processTable[pid];
  if (!proc) return false;
  proc.signalHandlers[sigName] = handler;
  return true;
}

export function unregisterSignalHandler(pid, sigName) {
  const proc = processTable[pid];
  if (!proc) return false;
  delete proc.signalHandlers[sigName];
  return true;
}
