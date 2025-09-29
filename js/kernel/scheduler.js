// File: js/kernel/scheduler.js
import { log } from '../utils/logger.js';

export function startScheduler() {
  log('info', 'Scheduler context started (Worker-based).');
}

export function stopScheduler() {
  log('info', 'Scheduler context stopped.');
}

export function enqueue(proc) {
    log('info', `Process ${proc.pid} acknowledged. Running in its own worker.`);
}