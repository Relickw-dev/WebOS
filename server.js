// server.js
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

// --- MODIFICARE CHEIE: Definim rădăcina virtuală ---
const virtualRoot = path.join(process.cwd(), 'fs_root');

// Funcție de securitate pentru a ne asigura că nu ieșim din virtualRoot
function securePath(relativePath) {
    const absolutePath = path.resolve(virtualRoot, relativePath);
    if (!absolutePath.startsWith(virtualRoot)) {
        throw new Error('Access denied: Path is outside the allowed directory.');
    }
    return absolutePath;
}

// Endpoint pentru 'ls'
app.get('/api/files', async (req, res) => {
    try {
        const relativePath = req.query.path || '.';
        const absolutePath = securePath(relativePath); // Securizăm calea
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });
        const files = entries.map(entry => entry.isDirectory() ? `${entry.name}/` : entry.name);
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
        
        const absolutePath = securePath(relativePath); // Securizăm calea
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
        const relativePath = req.body.path;
        if (!relativePath) throw new Error('mkdir: missing operand');

        const absolutePath = securePath(relativePath); // Securizăm calea
        await fs.mkdir(absolutePath);
        res.json({ success: true });
    } catch (error) {
        res.status(400).json({ error: error.message || `mkdir: cannot create directory` });
    }
});

// Endpoint pentru validarea căilor ('cd')
app.post('/api/checkdir', async (req, res) => {
    try {
        const relativePath = req.body.path;
        const absolutePath = securePath(relativePath); // Securizăm calea
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

// --- Funcție de pornire a serverului ---
async function startServer() {
    try {
        // Creăm directorul rădăcină virtual dacă nu există
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