// File: server/fs_api.js
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const router = express.Router();


const virtualRoot = path.join(process.cwd(), 'fs_root');

// --- AICI ESTE MODIFICAREA CRITICĂ ---
// Am înlocuit path.resolve cu path.join și path.normalize
// pentru a combina corect calea de bază cu cea de la client,
// chiar și atunci când calea de la client începe cu '/'.
function securePath(relativePath) {
  const safeRelative = relativePath || '.';
  
  // path.join combină corect căile, prevenind interpretarea greșită.
  const joinedPath = path.join(virtualRoot, safeRelative);
  
  // path.normalize rezolvă segmentele '..' și '.' pentru securitate sporită.
  const normalizedPath = path.normalize(joinedPath);

  // Verificarea de securitate este esențială pentru a nu ieși din 'fs_root'.
  if (!normalizedPath.startsWith(virtualRoot)) {
    throw { code: 'EACCES', message: 'Access denied' };
  }
  
  return normalizedPath;
}

router.post('/files', async (req, res) => {
  try {
    const { path: relPath, options = {} } = req.body;
    const abs = securePath(relPath);
    const entries = await fs.readdir(abs, { withFileTypes: true });
    const files = [];
    for (const ent of entries) {
      if (!options.showHidden && ent.name.startsWith('.')) continue;
      if (options.longFormat) {
        const stats = await fs.stat(path.join(abs, ent.name));
        files.push({ name: ent.name, isDirectory: ent.isDirectory(), size: stats.size, mtime: stats.mtime.toISOString() });
      } else {
        files.push(ent.isDirectory() ? `${ent.name}/` : ent.name);
      }
    }
    files.sort((a,b)=> (a.name||a).localeCompare(b.name||b));
    res.json(files);
  } catch (e) {
    res.status(400).json({ code: e.code || 'EIO', error: e.message || 'ls error' });
  }
});

router.post('/cat', async (req, res) => {
  try {
    const rel = req.body.path; // Citim calea din corpul cererii POST
    if (!rel) throw { code: 'EINVAL', message: 'cat: missing operand' };
    const abs = securePath(rel);
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) throw { code: 'EISDIR', message: 'Is a directory' };
    const content = await fs.readFile(abs, 'utf8');
    // Răspunsul este un JSON, dar clientul (syscall 'stdout') așteaptă un string direct.
    // Presupunând că 'requestJson' pe client extrage 'content', lăsăm așa deocamdată.
    // Clientul va primi { content: "..." }, iar funcția `vfs.read` va trebui să returneze `body.content`.
    // Să verificăm client.js... da, `readFile` returnează tot obiectul.
    // Iar în `cat.js`, `syscall('vfs.read', { path })` primește acest obiect.
    // Vom ajusta și client.js pentru a fi mai curat.
    res.json({ content });
  } catch (e) {
    res.status(400).json({ code: e.code || 'EIO', error: e.message || 'cat error' });
  }
});

router.post('/mkdir', async (req, res) => {
  try {
    const { path: rel, createParents } = req.body;
    if (!rel) throw { code: 'EINVAL', message: 'mkdir: missing operand' };
    const abs = securePath(rel);
    await fs.mkdir(abs, { recursive: !!createParents });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ code: e.code || 'EIO', error: e.message }); }
});

router.post('/touch', async (req, res) => {
    try {
        const { path: filePath, content = '', append = false } = req.body;
        const fullPath = securePath(filePath);

        if (append) {
            await fs.appendFile(fullPath, content);
        } else {
            await fs.writeFile(fullPath, content);
        }

        res.json({ success: true, path: filePath });
    } catch (error) {
        res.status(500).json({ error: error.message, code: error.code });
    }
});

router.post('/rm', async (req, res) => {
  try {
    const { path: rel, force } = req.body;
    if (!rel) throw { code: 'EINVAL', message: 'rm: missing operand' };
    const abs = securePath(rel);
    await fs.rm(abs, { recursive: true, force: !!force });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ code: e.code || 'EIO', error: e.message }); }
});

router.post('/copy', async (req, res) => {
  try {
    const { source, destination, recursive } = req.body;
    if (!source || !destination) throw { code: 'EINVAL', message: 'cp missing operand' };
    const absSrc = securePath(source);
    const absDst = securePath(destination);
    const st = await fs.stat(absSrc);
    if (st.isDirectory() && !recursive) throw { code: 'EISDIR', message: 'cp: -r not specified' };
    await fs.cp(absSrc, absDst, { recursive: !!recursive });
    res.json({ success: true });
  } catch (e) { res.status(400).json({ code: e.code || 'EIO', error: e.message }); }
});

router.post('/mv', async (req, res) => {
  try {
    const { source, destination } = req.body;
    if (!source || !destination) throw { code: 'EINVAL', message: 'mv missing operand' };
    const absSrc = securePath(source);
    let absDst = securePath(destination);
    try {
      const dstStat = await fs.stat(absDst);
      if (dstStat.isDirectory()) absDst = path.join(absDst, path.basename(absSrc));
    } catch(e){}
    await fs.rename(absSrc, absDst);
    res.json({ success: true });
  } catch (e) { res.status(400).json({ code: e.code || 'EIO', error: e.message }); }
});

module.exports = router;