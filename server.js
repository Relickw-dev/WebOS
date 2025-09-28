// server.js
const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors());
app.use(express.json());

const projectRoot = process.cwd();

// Endpoint pentru comanda 'ls'
app.get('/api/files', async (req, res) => {
    const relativePath = req.query.path || '.';
    const absolutePath = path.join(projectRoot, relativePath);

    try {
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });
        const files = entries.map(entry => entry.isDirectory() ? `${entry.name}/` : entry.name);
        res.json(files);
    } catch (error) {
        res.status(404).json({ error: `ls: cannot access '${relativePath}': No such file or directory` });
    }
});

// Endpoint pentru comanda 'cat'
app.get('/api/cat', async (req, res) => {
    const relativePath = req.query.path;
    if (!relativePath) {
        return res.status(400).json({ error: 'cat: missing operand' });
    }
    const absolutePath = path.join(projectRoot, relativePath);

    try {
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) {
            return res.status(400).json({ error: `cat: ${relativePath}: Is a directory` });
        }
        const content = await fs.readFile(absolutePath, 'utf-8');
        res.json({ content });
    } catch (error) {
        res.status(404).json({ error: `cat: ${relativePath}: No such file or directory` });
    }
});

// Endpoint nou pentru 'mkdir'
app.post('/api/mkdir', async (req, res) => {
    const relativePath = req.body.path;
    if (!relativePath) {
        return res.status(400).json({ error: 'mkdir: missing operand' });
    }
    const absolutePath = path.join(projectRoot, relativePath);

    try {
        await fs.mkdir(absolutePath);
        res.json({ success: true, message: `Directory '${relativePath}' created.` });
    } catch (error) {
        res.status(400).json({ error: `mkdir: cannot create directory ‘${relativePath}’: File exists or invalid path` });
    }
});

// Endpoint nou pentru validarea căilor ('cd')
app.post('/api/checkdir', async (req, res) => {
    const relativePath = req.body.path;
    const absolutePath = path.join(projectRoot, relativePath);
    try {
        const stats = await fs.stat(absolutePath);
        if (stats.isDirectory()) {
            res.json({ isDirectory: true });
        } else {
            res.status(400).json({ isDirectory: false, error: `cd: ${relativePath}: Not a directory` });
        }
    } catch (error) {
        res.status(404).json({ isDirectory: false, error: `cd: ${relativePath}: No such file or directory` });
    }
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`Serving files from: ${projectRoot}`);
});