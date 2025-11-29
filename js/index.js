// javascript
// File: `js/index.js` (modificado para exponer /health)

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
let nanoid; // se asigna dinámicamente porque nanoid es ESM
const bcrypt = require('bcryptjs');

const app = express();
app.use(cors());
app.use(bodyParser.json());

// HEALTH endpoint para checks de plataforma
app.get('/health', (req, res) => res.json({ ok: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'index.html'));
});

(async function main(){
    try{
        // import dinámico de lowdb (ESM)
        const lowdb = await import('lowdb');
        const lowdbNode = await import('lowdb/node');
        const { Low } = lowdb;
        const { JSONFile } = lowdbNode;

        // import dinámico de nanoid (ESM)
        nanoid = (await import('nanoid')).nanoid;

        // LowDB setup
        const file = path.join(__dirname, '..', 'db.json');
        const adapter = new JSONFile(file);
        const defaultData = { users: [], clientes: [], inmuebles: [], operations: [] };

        // pasar defaultData al constructor para evitar "missing default data"
        const db = new Low(adapter, defaultData);

        await db.read();
        // db.data ya contendrá defaultData si el archivo no existe o está vacío
        await db.write();

        async function findUserByToken(token){
            await db.read();
            const op = (db.data.operations || []).find(o => o.token === token && o.type === 'login');
            if(!op) return null;
            const user = (db.data.users || []).find(u => u.id === op.userId);
            return user || null;
        }

        // Register
        app.post('/api/register', async (req, res) => {
            const { name, email, password } = req.body;
            if(!email || !password) return res.status(400).json({ error: 'email and password required' });
            await db.read();
            const exists = (db.data.users || []).find(u => u.email === email.toLowerCase());
            if(exists) return res.status(409).json({ error: 'user_exists' });
            const passwordHash = await bcrypt.hash(password, 10);
            const user = { id: nanoid(), name: name || '', email: email.toLowerCase(), passwordHash, role: 'user', createdAt: new Date().toISOString() };
            db.data.users = db.data.users || [];
            db.data.users.push(user);
            await db.write();
            const { passwordHash: _, ...safe } = user;
            res.json({ user: safe });
        });

        // Login
        app.post('/api/login', async (req, res) => {
            const { email, password } = req.body;
            if(!email || !password) return res.status(400).json({ error: 'email and password required' });
            await db.read();
            const user = (db.data.users || []).find(u => u.email === email.toLowerCase());
            if(!user) return res.status(401).json({ error: 'invalid_credentials' });
            const ok = await bcrypt.compare(password, user.passwordHash);
            if(!ok) return res.status(401).json({ error: 'invalid_credentials' });
            const token = nanoid(24);
            db.data.operations = db.data.operations || [];
            db.data.operations.push({ id: nanoid(), type: 'login', userId: user.id, token, at: new Date().toISOString() });
            await db.write();
            const { passwordHash: _, ...safe } = user;
            res.json({ user: safe, token });
        });

        // Protected: save cliente
        app.post('/api/clientes', async (req, res) => {
            const token = req.headers['x-auth-token'];
            if(!token) return res.status(401).json({ error: 'no_token' });
            const user = await findUserByToken(token);
            if(!user) return res.status(401).json({ error: 'invalid_token' });
            await db.read();
            db.data.clientes = db.data.clientes || [];
            const cliente = { id: nanoid(), ...req.body, createdAt: new Date().toISOString(), createdBy: user.id };
            db.data.clientes.push(cliente);
            await db.write();
            res.json({ cliente });
        });

        // Protected: save inmueble
        app.post('/api/inmuebles', async (req, res) => {
            const token = req.headers['x-auth-token'];
            if(!token) return res.status(401).json({ error: 'no_token' });
            const user = await findUserByToken(token);
            if(!user) return res.status(401).json({ error: 'invalid_token' });
            await db.read();
            db.data.inmuebles = db.data.inmuebles || [];
            const inmueble = { id: nanoid(), ...req.body, createdAt: new Date().toISOString(), createdBy: user.id };
            db.data.inmuebles.push(inmueble);
            await db.write();
            res.json({ inmueble });
        });

        // Protected: log operation (e.g., calculation, export)
        app.post('/api/operations', async (req, res) => {
            const token = req.headers['x-auth-token'];
            if(!token) return res.status(401).json({ error: 'no_token' });
            const user = await findUserByToken(token);
            if(!user) return res.status(401).json({ error: 'invalid_token' });
            await db.read();
            db.data.operations = db.data.operations || [];
            const op = { id: nanoid(), type: req.body.type || 'unknown', userId: user.id, payload: req.body.payload || {}, at: new Date().toISOString() };
            db.data.operations.push(op);
            await db.write();
            res.json({ operation: op });
        });

        const PORT = process.env.PORT || 3001;
        app.listen(PORT, () => console.log(`Auth server listening on http://localhost:${PORT}`));
    }catch(err){
        console.error('Startup error:', err);
        process.exit(1);
    }
})();