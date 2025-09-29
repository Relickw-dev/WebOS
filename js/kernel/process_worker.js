// File: js/kernel/process_worker.js
let pid = -1;
let args = [];
let logic = null;
let syscallCounter = 0;
const pendingSyscalls = new Map();
let stdinPort = null;
let stdoutPort = null;

function syscall(name, params) {
  return new Promise((resolve, reject) => {
    const callId = syscallCounter++;
    pendingSyscalls.set(callId, { resolve, reject });
    postMessage({ type: 'syscall', callId, name, params });
  });
}

self.onmessage = async (e) => {
  const { type, ...data } = e.data;

  switch (type) {
    case 'init':
      pid = data.pid;
      args = data.args;
      stdinPort = data.stdin;
      stdoutPort = data.stdout;
      
      try {
        const module = await import(data.logicPath);
        logic = module.default;
        executeLogic();
      } catch (err) {
        postMessage({ type: 'error', message: `Failed to load logic: ${err.message}` });
        self.close();
      }
      break;

    case 'syscall_result':
      if (pendingSyscalls.has(data.callId)) {
        pendingSyscalls.get(data.callId).resolve(data.result);
        pendingSyscalls.delete(data.callId);
      }
      break;
      
    case 'syscall_error':
      if (pendingSyscalls.has(data.callId)) {
        pendingSyscalls.get(data.callId).reject(new Error(data.error));
        pendingSyscalls.delete(data.callId);
      }
      break;
    
    case 'set_stdout':
        stdoutPort = data.port;
        break;
  }
};

async function executeLogic() {
  if (!logic) return;

  const context = { syscall, stdin: stdinPort, stdout: stdoutPort };
  
  try {
    const exitCode = await logic(args, context);
    postMessage({ type: 'exit', code: exitCode || 0 });
  } catch (err) {
    postMessage({ type: 'error', message: err.message });
  } finally {
    self.close();
  }
}