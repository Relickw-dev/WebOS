// server.js
const express = require('express');
const fs = require('fs/promises'); // Folosim varianta cu Promises pentru async/await
const path = require('path');
const cors = require('cors');

const app = express();
const port = 3000;

app.use(cors()); // Permite cereri de la client (din browser)
app.use(express.json()); // Permite serverului să înțeleagă JSON

// Rădăcina de unde serverul va citi fișierele (directorul curent al proiectului)
const projectRoot = process.cwd();

// Endpoint pentru comanda 'ls'
app.get('/api/files', async (req, res) => {
    // Primim calea ca parametru query (ex: /api/files?path=./js)
    const relativePath = req.query.path || '.';
    const absolutePath = path.join(projectRoot, relativePath);

    try {
        const entries = await fs.readdir(absolutePath, { withFileTypes: true });
        const files = entries.map(entry => {
            return entry.isDirectory() ? `${entry.name}/` : entry.name;
        });
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
        const content = await fs.readFile(absolutePath, 'utf-8');
        res.json({ content });
    } catch (error) {
         res.status(404).json({ error: `cat: ${relativePath}: No such file or directory` });
    }
});


app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    console.log(`Serving files from: ${projectRoot}`);
});