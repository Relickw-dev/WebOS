// File: js/kernel/syscalls.js
import * as core from './core.js';
import * as scheduler from './scheduler.js';
import * as vfs from '../vfs/client.js';
import { log } from '../utils/logger.js';

// Helper: run pipeline of stages; each stage: { name, args, logic, stdout, fullCmd }
// supports stdin input (string), redirections to file via proc syscall, background flag
export async function syscall(call, params = {}) {
  switch (call) {
    case 'proc.spawn': {
      const proc = core.spawnProcess(params);
      if (params.enqueue) scheduler.enqueue(proc);
      return proc;
    }

    case 'proc.list': return core.listProcesses();

    case 'proc.kill': return core.killProcess(params.pid);

    case 'proc.wait': return core.waitForExit(params.pid);

    case 'proc.sendSignal': return core.sendSignal(params.pid, params.signal);

    case 'proc.pipeline': {
      const { pipeline, background = false, logFunction = (()=>{}), stdin } = params;
      const pids = [];
      let input = stdin || null;

      for (let i = 0; i < pipeline.length; i++) {
        const stage = pipeline[i];
        const stdout = stage.stdout || { type: 'terminal' };

        const logicWrapper = async (args, ctx) => {
          let out = '';
          const writer = (s) => { if (s) out += String(s); };
          const maybe = await stage.logic(args, { stdin: input, log: writer });
          if (typeof maybe === 'string') out = maybe;

          input = out;

          if (i === pipeline.length - 1) {
            if (stdout.type === 'redirect') {
              // Aici este modificarea crucială
              await syscall('fs.writeFile', { path: stdout.file, content: out, append: stdout.append });
            } else {
              logFunction(out);
            }
          }
          return 0;
        };

        const proc = core.spawnProcess({ 
          name: stage.name, 
          args: stage.args, 
          logic: logicWrapper, 
          meta: { fullCmd: stage.fullCmd } 
        });
        pids.push(proc.pid);
        scheduler.enqueue(proc);
      }

      if (background) {
        log('info', `background job started: ${pids.join(',')}`);
        return { pids };
      } else {
        const lastPid = pids[pids.length - 1];
        await core.waitForExit(lastPid);
        return null;
      }
    }

    // FS proxies
    case 'fs.readDir': return await vfs.readDir(params.path, params.options || {});
    case 'fs.readFile': return await vfs.readFile(params.path);
    case 'fs.writeFile': {
      return await vfs.writeFile(params.path, params.content, params.append);
    }
    case 'fs.makeDir': return await vfs.mkdir(params.path, params.createParents);
    case 'fs.touchFile': return await vfs.writeFile(params.path, params.content || '');
    case 'fs.remove': return await vfs.rm(params.path, params.force);
    case 'fs.move': return await vfs.mv(params.source, params.destination);
    case 'fs.copy': return await vfs.cp(params.source, params.destination, params.recursive);

    default:
      throw new Error(`Unknown syscall: ${call}`);
  }
}
