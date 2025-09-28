// server.js
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const virtualRoot = path.join(process.cwd(), 'fs_root');

function securePath(relativePath) {
    const safeRelativePath = relativePath || '.';
    const absolutePath = path.resolve(virtualRoot, safeRelativePath);
    if (!absolutePath.startsWith(virtualRoot)) {
        throw new Error('Access denied: Path is outside the allowed directory.');
    }
    return absolutePath;
}

// Endpoint pentru 'ls'
app.post('/api/files', async (req, res) => {
    try {
        const { path: relativePath, options = {} } = req.body;
        const absolutePath = securePath(relativePath);
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });

        let files = [];
        for (const entry of entries) {
            if (!options.showHidden && entry.name.startsWith('.')) {
                continue;
            }

            if (options.longFormat) {
                const stats = await fs.stat(path.join(absolutePath, entry.name));
                files.push({
                    name: entry.name,
                    isDirectory: entry.isDirectory(),
                    size: stats.size,
                    mtime: stats.mtime.toISOString(),
                });
            } else {
                files.push(entry.isDirectory() ? `${entry.name}/` : entry.name);
            }
        }
        
        files.sort((a, b) => (a.name || a).localeCompare(b.name || b));
        res.json(files);
    } catch (error) {
        res.status(400).json({ error: error.message || `ls: cannot access path` });
    }
});

// Endpoint pentru 'cat'
app.get('/api/cat', async (req, res) => {
    try {
        const relativePath = req.query.path;
        if (!relativePath) throw new Error('cat: missing operand');
        const absolutePath = securePath(relativePath);
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) throw new Error(`cat: ${relativePath}: Is a directory`);
        const content = await fs.readFile(absolutePath, 'utf-8');
        res.json({ content });
    } catch (error) {
        res.status(400).json({ error: error.message || `cat: No such file or directory` });
    }
});

// Endpoint pentru 'mkdir'
app.post('/api/mkdir', async (req, res) => {
    try {
        const { path: relativePath, createParents } = req.body;
        if (!relativePath) throw new Error('mkdir: missing operand');
        const absolutePath = securePath(relativePath);
        await fs.mkdir(absolutePath, { recursive: createParents || false });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `mkdir: cannot create directory` });
    }
});

// Endpoint pentru validarea căilor ('cd')
app.post('/api/checkdir', async (req, res) => {
    try {
        const relativePath = req.body.path;
        const absolutePath = securePath(relativePath);
        const stats = await fs.stat(absolutePath);
        if (!stats.isDirectory()) throw new Error(`cd: ${relativePath}: Not a directory`);
        res.json({ isDirectory: true });
    } catch (error) {
        res.status(400).json({ isDirectory: false, error: error.message || `cd: No such file or directory` });
    }
});

// Endpoint pentru 'touch'/'writeFile'
app.post('/api/touch', async (req, res) => {
    try {
        const relativePath = req.body.path;
        const content = req.body.content || ''; 
        if (!relativePath) throw new Error('touch: missing file operand');
        
        const absolutePath = securePath(relativePath);
        await fs.writeFile(absolutePath, content);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `cannot write to file` });
    }
});

// Endpoint pentru 'rm'
app.post('/api/rm', async (req, res) => {
    try {
        const { path: relativePath, force } = req.body;
        if (!relativePath) throw new Error('rm: missing operand');
        const absolutePath = securePath(relativePath);
        await fs.rm(absolutePath, { recursive: true, force: force || false });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `rm: cannot remove` });
    }
});

// Endpoint pentru 'cp'
app.post('/api/copy', async (req, res) => {
    try {
        const { source, destination, recursive } = req.body;
        if (!source || !destination) throw new Error('cp: missing operand');

        const absoluteSource = securePath(source);
        const absoluteDestination = securePath(destination);

        const stats = await fs.stat(absoluteSource);
        if (stats.isDirectory() && !recursive) {
            throw new Error(`cp: -r not specified; omitting directory '${source}'`);
        }
        
        await fs.cp(absoluteSource, absoluteDestination, { recursive: recursive || false });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `cp: cannot copy` });
    }
});

// Endpoint pentru 'mv'
app.post('/api/mv', async (req, res) => {
    try {
        const { source, destination } = req.body;
        if (!source || !destination) throw new Error('mv: missing operand');

        const absoluteSource = securePath(source);
        let absoluteDestination = securePath(destination);
        
        try {
            const destStats = await fs.stat(absoluteDestination);
            if (destStats.isDirectory()) {
                const sourceBaseName = path.basename(absoluteSource);
                absoluteDestination = path.join(absoluteDestination, sourceBaseName);
            }
        } catch (e) { /* Destinația nu există, deci e o redenumire */ }
        
        await fs.rename(absoluteSource, absoluteDestination);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `mv: cannot move` });
    }
});

async function startServer() {
    try {
        await fs.mkdir(virtualRoot, { recursive: true });
        app.listen(port, () => {
            console.log(`Server is running at http://localhost:${port}`);
            console.log(`Serving files from virtual root: ${virtualRoot}`);
        });
    } catch (error) {
        console.error("Failed to create virtual root directory or start server:", error);
    }
}

startServer();