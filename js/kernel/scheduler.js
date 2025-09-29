// File: js/kernel/scheduler.js (simplificat)
import * as core from './core.js';
import { log } from '../utils/logger.js';

// Nu mai avem nevoie de un 'tick' sau de o coadă de rulare.
// Browser-ul gestionează execuția worker-ilor.

export function startScheduler() {
  log('info', 'Scheduler context started (Worker-based).');
  // Nu mai este nimic de făcut aici
}

export function stopScheduler() {
  log('info', 'Scheduler context stopped.');
  // Nu mai este nimic de făcut aici
}

// Această funcție nu mai este necesară, dar o lăsăm pentru compatibilitate
// dacă vrei să ai și procese care rulează în thread-ul principal.
export function enqueue(proc) {
    log('info', `Process ${proc.pid} acknowledged. Running in its own worker.`);
}