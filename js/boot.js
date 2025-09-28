// js/boot.js

import { initializeTerminal } from './terminal.js';

// Funcție ajutătoare pentru a scrie mesaje de boot
function logToBootScreen(message) {
    const output = document.getElementById('terminal-output');
    output.innerHTML += `<p>${message}</p>`;
}

// Funcția principală a bootloader-ului
export async function startBootSequence() {
    const inputLine = document.querySelector('.prompt-line');
    inputLine.style.display = 'none'; // Ascundem prompt-ul în timpul boot-ării

    logToBootScreen('BIOS v1.0 Initializing...');
    logToBootScreen('Loading Shell...');

    const output = document.getElementById('terminal-output');
    output.innerHTML = ''; // Curățăm ecranul de mesajele de boot
    
    inputLine.style.display = 'flex'; // Re-afișăm prompt-ul

    // Predăm controlul către terminal
    initializeTerminal();
}