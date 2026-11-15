const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';
const PACKS_FILE = path.join(__dirname, 'data', 'packs.json');
const VIEWS_FILE = path.join(__dirname, 'data', 'views.json');

app.use(cors()); // lets a future mobile app call this API
app.use(express.json({ limit: '1mb' }));

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

let packs = readJson(PACKS_FILE, []);
let views = readJson(VIEWS_FILE, {});
let saveTimer = null;
function saveViews() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { fs.writeFileSync(VIEWS_FILE, JSON.stringify(views)); } catch (e) { /* ignore */ }
  }, 2000);
}

// ---------- Packages ----------
app.get('/api/packs', (req, res) => {
  res.json(packs.map(p => ({ ...p, v: (p.v || 0) + (views[p.id] || 0) })));
});

// Called when someone opens a package; feeds the Trending list
app.post('/api/view/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!packs.some(p => p.id === id)) return res.sendStatus(404);
  views[id] = (views[id] || 0) + 1;
  saveViews();
  res.sendStatus(204);
});

// Replace all packages (send the full array). Needs the x-admin-key header.
app.put('/api/admin/packs', (req, res) => {
  if (!ADMIN_KEY || req.get('x-admin-key') !== ADMIN_KEY) return res.sendStatus(401);
  if (!Array.isArray(req.body)) return res.status(400).json({ error: 'Body must be an array of packs' });
  packs = req.body;
  fs.writeFileSync(PACKS_FILE, JSON.stringify(packs, null, 2));
  res.json({ count: packs.length });
});

// ---------- Speed test ----------
const chunk = crypto.randomBytes(64 * 1024);

app.get('/api/ping', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.sendStatus(204);
});

app.get('/api/speedtest/down', (req, res) => {
  let left = Math.min(Math.max(parseInt(req.query.bytes, 10) || 5e6, 1e5), 25e6);
  res.set({
    'Content-Type': 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': String(left)
  });
  (function write() {
    while (left > 0) {
      const n = Math.min(left, chunk.length);
      const ok = res.write(n === chunk.length ? chunk : chunk.subarray(0, n));
      left -= n;
      if (!ok) { res.once('drain', write); return; }
    }
    res.end();
  })();
});

app.post('/api/speedtest/up', express.raw({ type: '*/*', limit: '30mb' }), (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ bytes: req.body ? req.body.length : 0 });
});

// ---------- Website ----------
app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => console.log('SIMPULSE running at http://localhost:' + PORT));
