const express = require('express');
const cors = require('cors');
const path = require('path');
const store = require('./store');
const { evaluate } = require('./evaluator');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ADMIN_KEY = process.env.ADMIN_KEY || 'demo-admin-key';
function requireAdmin(req, res, next) {
  if (req.get('x-admin-key') !== ADMIN_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
}

app.get('/health', (req, res) => res.json({ ok: true, version: store.snapshot().version }));

// Full snapshot with ETag: clients get a cheap 304 when nothing changed
app.get('/flags', (req, res) => {
  const s = store.snapshot();
  const etag = `"v${s.version}"`;
  res.set('ETag', etag);
  res.set('Cache-Control', 'no-cache');
  if (req.get('If-None-Match') === etag) return res.status(304).end();
  res.json(s);
});

// Server-side evaluation, with timing exposed as a header
app.post('/evaluate/:key', (req, res) => {
  const t = process.hrtime.bigint();
  const result = evaluate(store.snapshot().flags[req.params.key], req.body || {});
  res.set('X-Eval-Time-Us', String(Number(process.hrtime.bigint() - t) / 1000));
  res.json(result);
});

// Admin writes
app.put('/flags/:key', requireAdmin, (req, res) => {
  res.json(store.upsert({ ...req.body, key: req.params.key }));
});
app.delete('/flags/:key', requireAdmin, (req, res) => {
  store.remove(req.params.key);
  res.status(204).end();
});

// Push channel (Server-Sent Events)
app.get('/stream', (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  const send = (s) => res.write(`data: ${JSON.stringify(s)}\n\n`);
  send(store.snapshot());                                          // initial state
  const unsub = store.subscribe(send);                             // future changes
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);  // keep-alive
  req.on('close', () => { clearInterval(ping); unsub(); });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FlagStream running on port ${PORT}`));
