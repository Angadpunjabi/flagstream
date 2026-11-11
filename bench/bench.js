const { evaluate } = require('../evaluator');
const BASE = process.env.BASE_URL || 'http://localhost:3000';

const flag = { key: 'new-checkout', enabled: true, rollout: 50 };
const N = 1000000;
const t = process.hrtime.bigint();
for (let i = 0; i < N; i++) evaluate(flag, { userId: 'user' + i });
const ns = Number(process.hrtime.bigint() - t);
console.log(`LOCAL  (SDK cache): ${(ns / N / 1000).toFixed(3)} microseconds per evaluation`);

(async () => {
  const M = 200;
  const t2 = Date.now();
  for (let i = 0; i < M; i++) {
    await fetch(BASE + '/evaluate/new-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'user' + i })
    });
  }
  console.log(`REMOTE (HTTP call): ${((Date.now() - t2) / M).toFixed(2)} ms per evaluation`);
})();
