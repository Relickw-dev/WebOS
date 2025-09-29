// File: js/kernel/core.js
import { log } from '../utils/logger.js';
import * as vfs from '../vfs/client.js';
import * as scheduler from './scheduler.js';

let processTable = {};
let nextPid = 1;
const waiters = {}; // pid -> [resolve,...]
const eventHandlers = {};

/**
 * Emite un eveniment (apelează un syscall) și returnează o promisiune
 * care se va rezolva cu rezultatul handler-ului.
 * @param {string} eventName - Numele syscall-ului (ex: 'proc.pipeline').
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
    iterator: null, // <<< MODIFICARE: Adăugat pentru a stoca starea generatorului
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
  delete proc.iterator; // <<< MODIFICARE: Curățăm iteratorul la ieșire
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
  delete proc.iterator; // <<< MODIFICARE: Curățăm iteratorul la kill
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

export function sendSignal(pid, sig) {
  const proc = processTable[pid];
  if (!proc) return false;
  proc.signalQueue.push(sig);
  const handler = proc.signalHandlers[sig];
  if (typeof handler === 'function') {
    try {
      handler(sig);
    } catch (e) {
      log('error', `signal handler for ${pid} threw: ${e.message}`);
    }
  } else {
    if (sig === 'SIGTERM' || sig === 'SIGKILL') {
      killProcess(pid, sig === 'SIGKILL' ? 9 : 15);
      return true;
    }
    if (sig === 'SIGINT') {
      proc.cancelled = true;
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

/**
 * Înregistrează toți handler-ii pentru apelurile de sistem.
 * Această funcție centralizează logica kernel-ului.
 */
export function setupProcessHandlers() {
  // === HANDLERE PROCESE (proc.*) ===

  /**
   * Handler pentru 'proc.pipeline'.
   * Transformă întregul pipeline într-un singur proces "executor" care este adăugat
   * în scheduler-ul principal, făcând astfel pipeline-ul complet preemptiv.
   */
  on('proc.pipeline', async (params, resolve, reject) => {
    const { pipeline, logFunction, stdin, cwd, background } = params;

    // 1. Definim logica pentru noul nostru "super-proces" executor.
    // Aceasta este o funcție generator care va orchestra întregul pipeline.
    const pipelineExecutorLogic = async function* (args, context) {
      let currentStdin = stdin;

      try {
        // Iterează prin fiecare comandă (etapă) din pipeline
        for (let i = 0; i < pipeline.length; i++) {
          const stage = pipeline[i];

          // Creează un context specific pentru această etapă
          const stageContext = {
            stdin: currentStdin,
            stdout: stage.stdout,
            pid: context.pid, // Folosim PID-ul procesului executor
            cwd: cwd,
          };

          // Obține iteratorul pentru logica comenzii curente (ex: ls, cat, etc.)
          const commandIterator = stage.logic(stage.args, stageContext);
          
          // Rulează comanda curentă pas cu pas, cedând controlul după fiecare pas
          let commandResult = await commandIterator.next();
          while (!commandResult.done) {
            commandResult = await commandIterator.next();
            yield; // <<< MODIFICARE CHEIE: Cedează controlul scheduler-ului principal!
          }

          // Salvează output-ul comenzii pentru a-l folosi ca input pentru următoarea
          const stdout = commandResult.value;

          // Gestionează redirectarea output-ului
          if (stage.stdout.type === 'redirect') {
            await emit('fs.writeFile', {
              path: stage.stdout.file,
              content: stdout,
              append: stage.stdout.append,
            });
            currentStdin = null; // Output-ul a fost redirectat, nu se mai pasează
          } else if (stage.stdout.type === 'terminal') {
            // Dacă este ultima comandă din pipeline, afișează rezultatul
            if (i === pipeline.length - 1 && logFunction && stdout) {
              logFunction(String(stdout));
            }
            currentStdin = stdout;
          } else {
            currentStdin = stdout;
          }
        }
        return 0; // Exit code de succes pentru întregul pipeline
      } catch (e) {
        const errorMessage = e && e.message ? e.message : String(e);
        const formattedError = `Error: ${errorMessage}\n`;
        if (logFunction) {
          logFunction(formattedError);
        }
        throw e; // Aruncă eroarea pentru a fi prinsă și a returna un exit code de eroare
      }
    };

    // 2. Creăm un singur proces pentru acest executor
    const executorProc = spawnProcess({
      name: pipeline.map(p => p.name).join(' | '),
      logic: pipelineExecutorLogic,
      meta: { fullCmd: pipeline.map(p => p.fullCmd).join(' | ') },
    });

    // 3. Adăugăm procesul executor în coada scheduler-ului pentru a rula
    scheduler.enqueue(executorProc);

    // 4. Dacă procesul nu este în background, așteptăm finalizarea lui.
    //    Dacă este în background, rezolvăm imediat cu PID-ul.
    if (!background) {
      waitForExit(executorProc.pid)
        .then(exitStatus => resolve({ pids: [executorProc.pid], status: exitStatus.exitCode === 0 ? 'completed' : 'error' }))
        .catch(reject);
    } else {
      resolve({ pids: [executorProc.pid], status: 'background' });
    }
  });

  on('proc.spawn', (params, resolve) => {
      const proc = spawnProcess(params);
      if (params.enqueue) {
        scheduler.enqueue(proc);
      }
      resolve(proc);
  });

  on('proc.list', (params, resolve) => resolve(listProcesses()));
  on('proc.kill', (params, resolve) => resolve(killProcess(params.pid)));
  on('proc.wait', (params, resolve) => waitForExit(params.pid).then(resolve));
  on('proc.sendSignal', (params, resolve) => resolve(sendSignal(params.pid, params.signal)));

  // === HANDLERE SISTEM DE FIȘIERE (fs.*) ===
  // ... restul handlerelor rămân neschimbate ...
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