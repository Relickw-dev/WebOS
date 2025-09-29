// File: server/fs_api.js
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const router = express.Router();

const virtualRoot = path.join(process.cwd(), 'fs_root');

// --- AICI ESTE MODIFICAREA CRITICĂ ---
// Am ajustat funcția pentru a gestiona corect căile absolute trimise de client.
function securePath(relativePath) {
    let safeRelative = relativePath || '.';
    
    // Corectură: Dacă calea începe cu '/', eliminăm doar acel caracter.
    // Astfel, path.join va combina corect '/cale/server' + 'cale/client'.
    if (safeRelative.startsWith('/')) {
        safeRelative = safeRelative.substring(1);
    }

    const joinedPath = path.join(virtualRoot, safeRelative);
    const normalizedPath = path.normalize(joinedPath);

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
    const rel = req.body.path;
    if (!rel) throw { code: 'EINVAL', message: 'cat: missing operand' };
    const abs = securePath(rel);
    const stat = await fs.stat(abs);
    if (stat.isDirectory()) throw { code: 'EISDIR', message: 'Is a directory' };
    const content = await fs.readFile(abs, 'utf8');
    res.json({ content });
  } catch (e) {
    res.status(400).json({ code: e.code || 'EIO', error: e.message || 'cat error' });
  }
});

router.post('/stat', async (req, res) => {
  try {
    const { path: relPath } = req.body;
    if (!relPath) {
      throw { code: 'EINVAL', message: 'stat: missing operand' };
    }
    const absPath = securePath(relPath);
    const stats = await fs.stat(absPath);
    
    res.json({ 
      success: true, 
      type: stats.isDirectory() ? 'dir' : 'file' 
    });
  } catch (e) {
    res.status(400).json({ code: e.code || 'EIO', error: e.message });
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
    const { path: rel, force, recursive } = req.body;
    if (!rel) throw { code: 'EINVAL', message: 'rm: missing operand' };
    
    const abs = securePath(rel);
    
    const stat = await fs.stat(abs);
    if (stat.isDirectory() && !recursive) {
        throw { code: 'EISDIR', message: 'Is a directory' };
    }

    await fs.rm(abs, { recursive: !!recursive, force: !!force });
    res.json({ success: true });
  } catch (e) { 
    res.status(400).json({ code: e.code || 'EIO', error: e.message }); 
  }
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