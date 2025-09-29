// File: js/terminal.js
// Terminal with pipe, redirection, env vars and Ctrl+C signal handling
import { syscall } from './kernel/syscalls.js';
import { log, dmesg } from './utils/logger.js';

function tokenize(line) {
  // split respecting quotes
  const re = /(?:[^\s"']+|"[^"]*"|'[^']*')+/g;
  return line.match(re) || [];
}

function stripQuotes(s) { return s.replace(/^["']|["']$/g, ''); }

export function initializeTerminal() {
  const container = document.getElementById('container');
  const output = document.getElementById('terminal-output');
  const input = document.getElementById('terminal-input');
  const promptElement = document.getElementById('prompt');

  const env = { USER: 'user', HOME: '/', SHELL: '/bin/webos' };
  const commandHistory = [];
  let historyIndex = -1;
  let cwd = '.';
  let jobs = {};
  let nextJobId = 1;
  let fgPids = []; // foreground pids for Ctrl+C

  function write(msg) {
    if (msg === null || msg === undefined || msg === '') return;
    output.innerHTML += `<p>${String(msg).replace(/\n/g,'<br>').replace(/ /g,'&nbsp;')}</p>`;
    output.scrollTop = output.scrollHeight;
  }

  function updatePrompt() {
    const displayPath = cwd === '.' ? '~' : `~/${cwd.replace(/^\.\//,'')}`;
    promptElement.textContent = `${env.USER}@webos:${displayPath}$`;
  }

  function expandVars(token) {
    return token.replace(/\$([A-Za-z_][A-Za-z0-9_]*)/g, (_, name) => env[name] || '');
  }

  function parseCommandLine(line) {
    // handle background &
    let isBackground = false;
    if (line.trim().endsWith('&')) {
      isBackground = true;
      line = line.trim().slice(0, -1).trim();
    }

    // pipeline split
    const stages = line.split('|').map(s => s.trim());
    const pipeline = stages.map(stageStr => {
      const tokens = tokenize(stageStr).map(t => expandVars(stripQuotes(t)));
      // detect redirection
      let stdout = { type: 'terminal' }; // default
      let stdinFile = null;
      const args = [];
      for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t === '>') {
          const file = tokens[++i];
          stdout = { type: 'redirect', file, append: false };
        } else if (t === '>>') {
          const file = tokens[++i];
          stdout = { type: 'redirect', file, append: true };
        } else if (t === '<') {
          stdinFile = tokens[++i];
        } else {
          args.push(t);
        }
      }
      const name = args.shift() || '';
      return { name, args, stdout, stdinFile, fullCmd: stageStr };
    });

    return { pipeline, background: isBackground };
  }

  // convert stage list to structures consumable by kernel.syscall('proc.pipeline')
  function buildPipelineFunctions(parsed) {
    return parsed.pipeline.map(s => {
      // attach logic for builtins or forward to generic handler
      const builtin = builtinCommands[s.name];
      const logic = builtin ? builtin : genericExec(s.name);
      return { name: s.name, args: s.args, stdout: s.stdout, stdinFile: s.stdinFile, logic, fullCmd: s.fullCmd };
    });
  }

  // generic executor for external/unknown commands
  function genericExec(name) {
    return async (args, context) => `${name}: command not found\n`;
  }

  // builtins
  const builtinCommands = {
    help: async () => `Available: help, clear, echo, date, ls, cat, cd, mkdir, touch, rm, mv, cp, ps, jobs, kill, sleep, dmesg, env, export, pwd, fg, bg`,
    clear: async () => { output.innerHTML = ''; return ''; },
    echo: async (args) => args.join(' ') + '\n',
    date: async () => new Date().toString() + '\n',
    pwd: async () => (cwd === '.' ? '/' : `/${cwd}`) + '\n',
    env: async () => Object.entries(env).map(([k,v])=>`${k}=${v}`).join('\n') + '\n',
    export: async (args) => {
        for (const kv of args) {
        const [k,v=''] = kv.split('=',2);
        env[k] = v;
        }
        return '';
    },
    dmesg: async () => dmesg().map(e=>`${e.ts} ${e.level} ${e.message}`).join('\n') + '\n',
    ls: async (args) => {
        const path = args[0] ? args[0] : cwd;
        const data = await syscall('fs.readDir', { path, options: {} });
        if (Array.isArray(data)) {
        return data.map(item => (item.name || item)).join('  ') + '\n';
        }
        return JSON.stringify(data) + '\n';
    },
    cat: async (args, context) => {
        if (args.length === 0) {
        if (context.stdin) return context.stdin;
        throw new Error('cat: missing file operand');
        }
        let out = '';
        for (const f of args) {
        const res = await syscall('fs.readFile', { path: f });
        out += res.content;
        }
        return out;
    },
    cd: async (args) => {
        const target = args[0] || '.';
        await syscall('fs.readDir', { path: target, options: {} });
        cwd = target;
        return '';
    },
    sleep: async (args) => {
        const ms = parseInt(args[0] || '1000', 10);
        await new Promise(r => setTimeout(r, ms));
        return `Slept ${ms}ms\n`;
    },
    ps: async () => {
        const table = await syscall('proc.list');
        const lines = ['PID\tSTATUS\t\tCOMMAND'];
        for (const pid of Object.keys(table)) {
        const p = table[pid];
        lines.push(`${pid}\t${p.status.padEnd(8,' ')}\t${p.commandStr || p.name}`);
        }
        return lines.join('\n') + '\n';
    },
    jobs: async () => {
        const list = [];
        for (const jid in jobs) {
        const job = jobs[jid];
        list.push(`[${jid}] ${job.pids.join(' ')}\t${job.commandStr}`);
        }
        return (list.length ? list.join('\n') : 'No active jobs.') + '\n';
    },
    kill: async (args) => {
        const pid = parseInt(args[0],10);
        if (isNaN(pid)) throw new Error('kill: usage: kill <pid>');
        await syscall('proc.sendSignal', { pid, signal: 'SIGTERM' });
        return '';
    },
    fg: async (args) => {
        const jid = (args[0] || '').replace('%','');
        const job = jobs[jid];
        if (!job) throw new Error(`fg: no such job ${jid}`);
        write(job.commandStr + '\n');
        const lastPid = job.pids[job.pids.length - 1];
        await syscall('proc.wait', { pid: lastPid });
        delete jobs[jid];
        return '';
    },
    bg: async (args) => {
        const jid = (args[0] || '').replace('%','');
        const job = jobs[jid];
        if (!job) throw new Error(`bg: no such job ${jid}`);
        write(`[${jid}] continued\n`);
        return '';
    },
    mkdir: async (args) => {
        const path = args[0];
        if (!path) throw new Error('mkdir: missing operand');
        await syscall('fs.makeDir', { path, createParents: args.includes('-p') });
        return '';
    },
    touch: async (args, context) => {
        if (args.length === 0) throw new Error('touch: missing file operand');
        const [path] = args;
        const content = context.stdin || '';
        
        // Determină dacă trebuie să facă append.
        // Pentru 'touch', de obicei nu se face append, dar dacă este folosit cu redirectare, contextul ar trebui să indice acest lucru.
        // Logica de redirectare din 'proc.pipeline' ar trebui să paseze corect flag-ul 'append'.
        // Presupunând că 'context.stdout' ar conține informații despre redirectare:
        const append = context.stdout ? context.stdout.append : false;

        // Corectarea apelului syscall pentru a respecta flag-ul 'append'
        await syscall('fs.writeFile', { path, content, append: append });
        return '';
    },
    rm: async (args) => {
        const force = args.includes('-f');
        const path = args.find(arg => !arg.startsWith('-'));
        if (!path) throw new Error('rm: missing operand');
        await syscall('fs.remove', { path, force });
        return '';
    },
    mv: async (args) => {
        const [source, destination] = args;
        if (!source || !destination) throw new Error('mv: missing operand');
        await syscall('fs.move', { source, destination });
        return '';
    },
    cp: async (args) => {
        const recursive = args.includes('-r');
        const nonFlagArgs = args.filter(arg => !arg.startsWith('-'));
        const [source, destination] = nonFlagArgs;
        if (!source || !destination) throw new Error('cp: missing operand');
        if (!recursive && (await syscall('fs.readDir', { path: source, options: {} })).some(entry => entry.isDirectory)) {
            throw new Error('cp: -r not specified for directory');
        }
        await syscall('fs.copy', { source, destination, recursive });
        return '';
    }
    };

  async function resolveStdinForPipeline(parsed) {
    if (!parsed.pipeline || parsed.pipeline.length === 0) return null;
    const first = parsed.pipeline[0];
    if (first.stdinFile) {
      const res = await syscall('fs.readFile', { path: first.stdinFile });
      return res.content;
    }
    return null;
  }

  async function executeLine(line) {
    if (!line.trim()) return;
    commandHistory.unshift(line);
    historyIndex = -1;
    write(`${promptElement.textContent} ${line}`);
    try {
      const parsed = parseCommandLine(line);
      const pipelineDefs = buildPipelineFunctions(parsed);
      const stdin = await resolveStdinForPipeline(parsed);

      const pipeParams = { pipeline: pipelineDefs, background: parsed.background, logFunction: write, stdin, cwd };
      const res = await syscall('proc.pipeline', pipeParams);
      if (parsed.background && res && res.pids) {
        const jid = nextJobId++;
        jobs[jid] = { pids: res.pids, commandStr: line };
        write(`[${jid}] ${res.pids.join(' ')}\n`);
      }
    } catch (e) {
      write(`Error: ${e.message}\n`);
    }
  }

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const command = input.value;
      input.value = '';
      await executeLine(command);
      updatePrompt();
    } else if (e.key === 'c' && (e.ctrlKey || e.metaKey)) {
      write('^C\n');
      for (const pid of fgPids) {
        try { await syscall('proc.sendSignal', { pid, signal: 'SIGINT' }); } catch(_) {}
      }
      fgPids = [];
      updatePrompt();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (historyIndex < commandHistory.length - 1) input.value = commandHistory[++historyIndex];
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) input.value = commandHistory[--historyIndex];
      else { historyIndex = -1; input.value = ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault();
    }
  });

  container.addEventListener('click', ()=> input.focus());

  write('WebOS Terminal (with signals, pipes, redirection, env, fg/bg) ready.\n');
  updatePrompt();
}
