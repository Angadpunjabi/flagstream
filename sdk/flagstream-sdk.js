const { evaluate } = require('../evaluator');

class FlagClient {
  constructor({ baseUrl, name = 'node', pollMs = 30000, onUpdate }) {
    this.baseUrl = baseUrl;
    this.name = name;
    this.pollMs = pollMs;
    this.onUpdate = onUpdate;
    this.flags = {};
    this.version = 0;
    this.etag = null;
    this.stopped = false;
    this.abort = new AbortController();
  }

  async start() {
    await this.refresh();
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

  apply(s) {
    if (s.version === this.version) return;
    this.version = s.version;
    this.flags = s.flags;
    if (this.onUpdate) this.onUpdate(this.name, s.version);
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

module.exports = { FlagClient };
