// File: js/boot.js
// --- MODIFICARE CHEIE: Importă setupProcessHandlers ---
import { initKernel, setupProcessHandlers } from './kernel/core.js';
import { startScheduler } from './kernel/scheduler.js';
import { log } from './utils/logger.js';

export async function startBootSequence() {
  const output = document.getElementById('terminal-output');
  function bootLog(msg) { output.innerHTML += `<p>${msg}</p>`; output.scrollTop = output.scrollHeight; }

  bootLog('BIOS v2.1 Initializing...');
  await new Promise(r => setTimeout(r, 150));
  bootLog('Initializing kernel...');
  initKernel();
  await new Promise(r => setTimeout(r, 100));
  
  // --- MODIFICARE CHEIE: Înregistrează handler-ele ---
  bootLog('Setting up process handlers...');
  setupProcessHandlers(); // Aici activăm logica pentru 'proc.pipeline'
  await new Promise(r => setTimeout(r, 100));
  // --- SFÂRȘIT MODIFICARE ---

  bootLog('Starting scheduler...');
  startScheduler();
  await new Promise(r => setTimeout(r, 100));
  bootLog('Launching shell...');
  log('info', 'Boot completed');
}