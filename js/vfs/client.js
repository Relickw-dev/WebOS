// File: js/vfs/client.js
import { SERVER_URL } from '../config.js';

async function requestJson(endpoint, options = {}) {
  const res = await fetch(`${SERVER_URL}/${endpoint}`, options);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(body.error || 'VFS Error');
    err.code = body.code || 'EIO';
    throw err;
  }
  return body;
}

export async function writeFile(path, content='', append=false) {
  return await requestJson('touch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, append })
  });
}

export async function readDir(path, opts) {
  return await requestJson('files', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path, options: opts }) });
}
export async function readFile(path) {
  return await requestJson(`cat?path=${encodeURIComponent(path)}`, { method: 'GET' });
}
export async function mkdir(path, createParents=false) {
  return await requestJson('mkdir', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path, createParents }) });
}
export async function rm(path, force=false) {
  return await requestJson('rm', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ path, force }) });
}
export async function cp(source, destination, recursive=false) {
  return await requestJson('copy', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ source, destination, recursive }) });
}
export async function mv(source, destination) {
  return await requestJson('mv', { method: 'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ source, destination }) });
}