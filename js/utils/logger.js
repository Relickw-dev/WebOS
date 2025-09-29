// File: js/utils/logger.js
const buffer = [];
const MAX = 1000;
export function log(level, message) {
  const entry = { ts: new Date().toISOString(), level, message };
  buffer.push(entry);
  if (buffer.length > MAX) buffer.shift();
  if (level === 'error') console.error('[dmesg]', entry);
  else if (level === 'warn') console.warn('[dmesg]', entry);
  else console.log('[dmesg]', entry);
}
export function dmesg() { return buffer.slice(); }
