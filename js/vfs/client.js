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

// --- TOATE FUNCȚIILE SUNT MODIFICATE PENTRU A ACCEPTA UN OBIECT 'params' ---

export async function writeFile(params) {
  const { path, content = '', append = false } = params;
  return await requestJson('touch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content, append })
  });
}

export async function readDir(params) {
  const { path, options } = params;
  return await requestJson('files', { 
      method: 'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({ path, options }) 
    });
}

export async function readFile(params) {
  const { path } = params;
  const body = await requestJson(`cat`, { 
    method: 'POST', 
    headers:{'Content-Type':'application/json'}, 
    body: JSON.stringify({ path }) 
  });
  return body.content;
}

export async function stat(params) {
  const { path } = params;
  return await requestJson('stat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path })
  });
}

export async function mkdir(params) {
  const { path, createParents = false } = params;
  return await requestJson('mkdir', { 
      method: 'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({ path, createParents }) 
    });
}

export async function remove(params) {
    const { path, force = false, recursive = false } = params;
    return requestJson('rm', {
        method: 'POST', 
        headers:{'Content-Type':'application/json'}, 
        body: JSON.stringify({ path, force, recursive }) 
    });
}

export async function cp(params) {
  const { source, destination, recursive = false } = params;
  return await requestJson('copy', { 
      method: 'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({ source, destination, recursive }) 
    });
}

export async function mv(params) {
  const { source, destination } = params;
  return await requestJson('mv', { 
      method: 'POST', 
      headers:{'Content-Type':'application/json'}, 
      body: JSON.stringify({ source, destination }) 
    });
}