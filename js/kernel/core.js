// File: js/kernel/core.js
import { log } from '../utils/logger.js';
import * as vfs from '../vfs/client.js';

let processTable = {};
let nextPid = 1;
const waiters = {};
const eventHandlers = {};

export function emit(eventName, params) {
  return new Promise((resolve, reject) => {
    const handler = eventHandlers[eventName];
    if (handler) {
      try {
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

export function spawnProcess({ name = 'proc', ppid = 0, args = [], logicPath = null, meta = {}, stdin = null, stdout = null }) {
  if (!logicPath) {
    throw new Error("spawnProcess requires a 'logicPath'.");
  }

  const pid = nextPid++;
  const worker = new Worker('/js/kernel/process_worker.js', { type: 'module' });

  const proc = { pid, ppid, name, args, status: 'created', startTime: Date.now(), worker, meta };
  processTable[pid] = proc;

  worker.onmessage = (e) => {
    const { type, ...data } = e.data;
    switch (type) {
      case 'syscall':
        emit(data.name, data.params)
          .then(result => worker.postMessage({ type: 'syscall_result', callId: data.callId, result }))
          .catch(error => worker.postMessage({ type: 'syscall_error', callId: data.callId, error: error.message }));
        break;
      case 'exit':
        exitProcess(pid, data.code);
        break;
      case 'error':
        log('error', `proc ${pid} crashed: ${data.message}`);
        exitProcess(pid, 1);
        break;
    }
  };

  const transferables = [];
  if (stdin) transferables.push(stdin);
  if (stdout) transferables.push(stdout);

  worker.postMessage({
    type: 'init',
    pid,
    args,
    logicPath,
    stdin,
    stdout
  }, transferables);
  
  proc.status = 'running';
  log('info', `spawned worker for pid=${pid} name=${proc.name}`);
  return proc;
}

export function getProcess(pid) { return processTable[pid] || null; }

export function listProcesses() {
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
  
  proc.worker.terminate();
  
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
    
    proc.worker.terminate();

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

export function setupProcessHandlers() {
  on('proc.spawn', (params, resolve, reject) => {
      try {
          const proc = spawnProcess(params);
          const { worker, ...procDetails } = proc;
          resolve(procDetails);
      } catch (e) { reject(e); }
  });

  on('proc.pipeline', (params, resolve, reject) => {
    const { pipeline, onOutput, onDone } = params;
    if (!pipeline || pipeline.length === 0) return resolve();

    const pids = [];
    let prevPort = null;
    
    pipeline.forEach((stage, index) => {
      let stdinPort = prevPort;
      let stdoutPort = null;
      
      const isLast = index === pipeline.length - 1;

      if (!isLast) {
        const channel = new MessageChannel();
        stdoutPort = channel.port1;
        prevPort = channel.port2;
      }

      const proc = spawnProcess({
        name: stage.name,
        logicPath: stage.logicPath,
        args: stage.args,
        stdin: stdinPort, 
        stdout: stdoutPort  
      });
      pids.push(proc.pid);

      if (isLast) {
        const finalChannel = new MessageChannel();
        proc.worker.postMessage({ type: 'set_stdout', port: finalChannel.port1 }, [finalChannel.port1]);
        
        finalChannel.port2.onmessage = (e) => {
          if (onOutput) onOutput(e.data);
        };
      }
    });

    const lastPid = pids[pids.length - 1];
    waitForExit(lastPid).then(status => {
      if (onDone) onDone(status.exitCode);
      pids.forEach(pid => {
        const p = getProcess(pid);
        if (p && p.status !== 'done' && p.status !== 'killed') {
          killProcess(pid);
        }
      });
      resolve({ pids, exitCode: status.exitCode });
    }).catch(reject);
  });

  on('proc.list', (params, resolve) => resolve(listProcesses()));
  on('proc.kill', (params, resolve) => resolve(killProcess(params.pid)));
  on('proc.wait', (params, resolve) => waitForExit(params.pid).then(resolve));
  
  on('fs.readDir', async (params, resolve, reject) => {
      try { resolve(await vfs.readDir(params.path, params.options || {})); } 
      catch (e) { reject(e); }
  });
  on('fs.readFile', async (params, resolve, reject) => {
      try { resolve(await vfs.readFile(params.path)); } 
      catch (e) { reject(e); }
  });
  on('fs.writeFile', async (params, resolve, reject) => {
      try { resolve(await vfs.writeFile(params.path, params.content, params.append)); }
      catch (e) { reject(e); }
  });
  on('fs.makeDir', async (params, resolve, reject) => {
      try { resolve(await vfs.mkdir(params.path, params.createParents)); } 
      catch (e) { reject(e); }
  });
  on('fs.remove', async (params, resolve, reject) => {
      try { resolve(await vfs.rm(params.path, params.force)); } 
      catch (e) { reject(e); }
  });
  on('fs.move', async (params, resolve, reject) => {
      try { resolve(await vfs.mv(params.source, params.destination)); }
      catch (e) { reject(e); }
  });
  on('fs.copy', async (params, resolve, reject) => {
      try { resolve(await vfs.cp(params.source, params.destination, params.recursive)); }
      catch (e) { reject(e); }
  });

  on('terminal.clear', (params, resolve) => resolve());
  on('terminal.getCwd', (params, resolve) => resolve());
  on('terminal.getCommands', (params, resolve) => resolve());
}