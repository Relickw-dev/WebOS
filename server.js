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
    const absolutePath = path.resolve(virtualRoot, relativePath);
    if (!absolutePath.startsWith(virtualRoot)) {
        throw new Error('Access denied: Path is outside the allowed directory.');
    }
    return absolutePath;
}

// Endpoint pentru 'ls' (neschimbat)
app.get('/api/files', async (req, res) => {
    try {
        const relativePath = req.query.path || '.';
        const absolutePath = securePath(relativePath);
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });
        const files = entries.map(entry => entry.isDirectory() ? `${entry.name}/` : entry.name);
        res.json(files);
    } catch (error) {
        res.status(400).json({ error: error.message || `ls: cannot access path` });
    }
});

// Endpoint pentru 'cat' (neschimbat)
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

// Endpoint pentru 'mkdir' (neschimbat)
app.post('/api/mkdir', async (req, res) => {
    try {
        const relativePath = req.body.path;
        if (!relativePath) throw new Error('mkdir: missing operand');
        const absolutePath = securePath(relativePath);
        await fs.mkdir(absolutePath);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `mkdir: cannot create directory` });
    }
});

// Endpoint pentru validarea căilor ('cd') (neschimbat)
app.post('/api/checkdir', async (req, res) => {
    try {
        const relativePath = req.body.path;
        const absolutePath = securePath(relativePath);
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) {
            res.json({ isDirectory: true });
        } else {
            throw new Error(`cd: ${relativePath}: Not a directory`);
        }
    } catch (error) {
        res.status(400).json({ isDirectory: false, error: error.message || `cd: No such file or directory` });
    }
});

// --- ENDPOINT MODIFICAT PENTRU 'touch'/'writeFile' ---
app.post('/api/touch', async (req, res) => {
    try {
        const relativePath = req.body.path;
        // Primim și conținut; dacă nu există, va fi un string gol (comportament de touch)
        const content = req.body.content || ''; 
        if (!relativePath) throw new Error('touch: missing file operand');
        
        const absolutePath = securePath(relativePath);
        await fs.writeFile(absolutePath, content);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `cannot write to file` });
    }
});

// --- ENDPOINT NOU PENTRU 'rm' ---
app.post('/api/rm', async (req, res) => {
    try {
        const relativePath = req.body.path;
        if (!relativePath) throw new Error('rm: missing operand');
        const absolutePath = securePath(relativePath);
        
        // `fs.rm` poate șterge atât fișiere, cât și foldere (cu `recursive: true`)
        await fs.rm(absolutePath, { recursive: true, force: true });
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `rm: cannot remove file or directory` });
    }
});

// --- ENDPOINT NOU PENTRU 'mv' ---
app.post('/api/mv', async (req, res) => {
    try {
        const { source, destination } = req.body;
        if (!source || !destination) throw new Error('mv: missing operand');

        const absoluteSource = securePath(source);
        const absoluteDestination = securePath(destination);
        
        await fs.rename(absoluteSource, absoluteDestination);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `mv: cannot move file or directory` });
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