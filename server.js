// File: server/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs/promises');
const fsApi = require('./fs_api');

const app = express();
const port = 3000;
const virtualRoot = path.join(process.cwd(), 'fs_root');

app.use(cors());
app.use(express.json());
app.use('/api', fsApi);
app.use('/', express.static(path.join(process.cwd(), 'public')));

async function start() {
  await fs.mkdir(virtualRoot, { recursive: true });
  app.listen(port, ()=> console.log(`Server listening http://localhost:${port}, root: ${virtualRoot}`));
}

start().catch(e => { console.error(e); process.exit(1); });
