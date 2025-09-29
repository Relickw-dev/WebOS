// File: js/kernel/syscalls.js
import { on, trigger } from './core.js'; // Am schimbat 'emit' în 'trigger'

// Funcția syscall care poate fi utilizată de orice parte a sistemului de pe thread-ul principal.
export function syscall(name, params) {
    return new Promise((resolve, reject) => {
        // Declanșează evenimentul syscall. Handler-ul se află în core.js.
        // Păstrăm resolve și reject pentru ca handler-ul să poată returna o valoare.
        trigger(name, params, resolve, reject); // Am schimbat 'emit' în 'trigger'
    });
}