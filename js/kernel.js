// js/kernel.js

import { startBootSequence } from './boot.js';

// --- GESTIUNEA PROCESELOR (Process Management) ---
let processTable = {};
let nextPid = 1;


// --- KERNEL API & SYSTEM CALLS ---

const SERVER_URL = 'http://localhost:3000/api';

async function apiRequest(endpoint, method = 'GET', body = null) {
    try {
        const options = {
            method,
            headers: {}
        };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${SERVER_URL}/${endpoint}`, options);
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error);
        }
        return data;
    } catch (error) {
        throw new Error(error.message || 'Connection to server failed.');
    }
}

export const kernel = {
    async syscall(call, params) {
        console.log(`Syscall: ${call}`, params);

        switch (call) {
            // --- System Calls pentru Procese ---
            case 'proc.run': {
                const pid = nextPid++;
                processTable[pid] = { name: params.name, status: 'running' };
                try {
                    // Executăm logica comenzii primită de la terminal
                    const result = await params.logic(params.args);
                    return result;
                } finally {
                    // Odată ce comanda s-a terminat (chiar dacă a dat eroare), procesul este eliminat
                    delete processTable[pid];
                    console.log(`Process ${pid} (${params.name}) finished.`);
                }
            }
            
            case 'proc.list': {
                // Returnează o copie a tabelei de procese pentru a preveni modificarea directă
                return Promise.resolve({ ...processTable });
            }

            // --- System Calls pentru File System ---
            case 'fs.readDir':
                return await apiRequest(`files?path=${encodeURIComponent(params.path)}`);
            case 'fs.readFile':
                return await apiRequest(`cat?path=${encodeURIComponent(params.path)}`);
            case 'fs.checkDir':
                return await apiRequest('checkdir', 'POST', { path: params.path });
            case 'fs.makeDir':
                return await apiRequest('mkdir', 'POST', { path: params.path });
            case 'fs.touchFile':
                return await apiRequest('touch', 'POST', { path: params.path });
            case 'fs.remove':
                return await apiRequest('rm', 'POST', { path: params.path });
            case 'fs.move':
                return await apiRequest('mv', 'POST', { source: params.source, destination: params.destination });

            default:
                throw new Error(`Unknown syscall: ${call}`);
        }
    }
};

// --- Inițializarea Sistemului ---
console.log("Kernel loaded. Starting boot sequence...");
startBootSequence();