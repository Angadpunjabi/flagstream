const fs = require('fs');
const { evaluate } = require('../evaluator');

// A transaction sees ONE frozen copy of the flags, taken when it starts.
class Transaction {
  constructor(flags, version) {
    this.flags = flags;
    this.version = version;
  }
  isEnabled(key, ctx) {
    return evaluate(this.flags[key], ctx).value;
  }
  end() { this.flags = null; }   // throw the snapshot away
}

class FlagClient {
  constructor({ baseUrl, name = 'node', pollMs = 30000, onUpdate, backupFile = null }) {
    this.baseUrl = baseUrl;
    this.name = name;
    this.pollMs = pollMs;
    this.onUpdate = onUpdate;
    this.backupFile = backupFile;      // last-known-good copy on disk
    this.flags = {};
    this.version = 0;
    this.etag = null;
    this.stopped = false;
    this.abort = new AbortController();
  }

  async start() {
    try {
      await this.refresh();
    } catch (e) {
      // server unreachable: fall back to the last-known-good backup
      if (!this.loadBackup()) throw e;
      console.log(`[${this.name}] server down, using backup v${this.version}`);
    }
    this.stream();                                   // runs in the background
    this.timer = setInterval(() => this.refresh().catch(() => {}), this.pollMs);
  }

  async refresh() {
    const headers = this.etag ? { 'If-None-Match': this.etag } : {};
    const r = await fetch(this.baseUrl + '/flags', { headers });
    if (r.status === 304 || !r.ok) return;
    this.etag = r.headers.get('etag');
    this.apply(await r.json());
  }

  valid(s) {
    return s && typeof s.version === 'number' && s.flags && typeof s.flags === 'object';
  }

  apply(s) {
    if (!this.valid(s)) return;                      // ignore bad data, keep the old flags
    if (s.version === this.version) return;
    this.version = s.version;
    this.flags = s.flags;                            // replaced, never edited in place
    this.saveBackup();
    if (this.onUpdate) this.onUpdate(this.name, s.version);
  }

  saveBackup() {
    if (!this.backupFile) return;
    try { fs.writeFileSync(this.backupFile, JSON.stringify({ version: this.version, flags: this.flags })); }
    catch (e) { /* backup is best effort */ }
  }

  loadBackup() {
    if (!this.backupFile) return false;
    try {
      const s = JSON.parse(fs.readFileSync(this.backupFile, 'utf8'));
      if (!this.valid(s)) return false;
      this.version = s.version;
      this.flags = s.flags;
      return true;
    } catch (e) { return false; }
  }

  startTransaction() {                               // pin the current flags
    return new Transaction(this.flags, this.version);
  }

  isEnabled(key, ctx) {                              // the hot path: pure memory
    return evaluate(this.flags[key], ctx).value;
  }

  async stream() {
    let delay = 1000;
    while (!this.stopped) {
      try {
        const res = await fetch(this.baseUrl + '/stream', {
          headers: { Accept: 'text/event-stream' },
          signal: this.abort.signal
        });
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        delay = 1000;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) !== -1) {
            const line = buf.slice(0, i).split('\n').find((l) => l.startsWith('data: '));
            buf = buf.slice(i + 2);
            if (line) this.apply(JSON.parse(line.slice(6)));
          }
        }
      } catch (e) {
        if (this.stopped) return;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 15000);            // exponential backoff
    }
  }

  stop() {
    this.stopped = true;
    clearInterval(this.timer);
    this.abort.abort();
  }
}

module.exports = { FlagClient, Transaction };
