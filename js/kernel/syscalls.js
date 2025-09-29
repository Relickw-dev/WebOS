// File: js/kernel/syscalls.js
import { emit } from './core.js';

/**
 * Punctul de intrare pentru toate apelurile de sistem din aplicație.
 * Această funcție acționează ca o interfață publică (un "wrapper")
 * pentru emițătorul de evenimente intern al kernel-ului.
 *
 * Orice parte a sistemului (de ex., terminalul) poate apela:
 * syscall('proc.pipeline', { ... });
 * syscall('fs.readFile', { path: '...' });
 *
 * Apelul este apoi transmis direct către kernel (`core.js`) pentru a fi
 * procesat de handler-ul corespunzător, înregistrat prin funcția `on`.
 *
 * @param {string} name - Numele apelului de sistem (ex: 'proc.list').
 * @param {object} params - Parametrii necesari pentru apel.
 * @returns {Promise<any>} O promisiune care se rezolvă cu rezultatul apelului.
 */
export function syscall(name, params) {
  // Pur și simplu trimitem apelul mai departe către emițătorul kernel-ului.
  return emit(name, params);
}