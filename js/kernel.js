// js/kernel.js

import { startBootSequence } from './boot.js';

// Kernel-ul este punctul central care pornește sistemul.
// Deocamdată, singura sa responsabilitate este să inițieze secvența de boot.
console.log("Kernel loaded. Starting boot sequence...");
startBootSequence();