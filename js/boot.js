// File: js/boot.js
import { initKernel } from './kernel/core.js';
import { startScheduler } from './kernel/scheduler.js';
import { initializeTerminal } from './terminal.js';
import { log } from './utils/logger.js';

export async function startBootSequence() {
  const output = document.getElementById('terminal-output');
  function bootLog(msg) { output.innerHTML += `<p>${msg}</p>`; output.scrollTop = output.scrollHeight; }

  bootLog('BIOS v2.1 Initializing...');
  await new Promise(r => setTimeout(r, 150));
  bootLog('Initializing kernel...');
  initKernel();
  await new Promise(r => setTimeout(r, 100));
  bootLog('Starting scheduler...');
  startScheduler();
  await new Promise(r => setTimeout(r, 100));
  bootLog('Launching shell...');
  initializeTerminal();
  log('info', 'Boot completed');
}
