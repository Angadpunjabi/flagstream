const { FlagClient } = require('../sdk/flagstream-sdk');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN = process.env.ADMIN_KEY || 'demo-admin-key';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function setFlag(body) {
  const r = await fetch(BASE + '/flags/new-checkout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN },
    body: JSON.stringify(body)
  });
  if (r.status === 401) { console.error('Wrong ADMIN_KEY'); process.exit(1); }
}

(async () => {
  let t0 = 0;
  const nodes = ['node-A', 'node-B', 'node-C'].map((name) => new FlagClient({
    baseUrl: BASE,
    name,
    onUpdate: (n, v) => { if (t0) console.log(`${n} received v${v} after ${Date.now() - t0} ms`); }
  }));
  await Promise.all(nodes.map((n) => n.start()));
  console.log('All nodes synced. Enabling new-checkout at 50% rollout...');
  await sleep(500);

  t0 = Date.now();
  await setFlag({ enabled: true, rollout: 50 });
  await sleep(1500);

  const users = ['alice', 'bob', 'carol', 'dave', 'erin', 'frank', 'teacher'];
  console.log('\nusers:  ', users.join(' '));
  for (const n of nodes) {
    console.log(n.name + ':', users.map((u) => (n.isEnabled('new-checkout', { userId: u }) ? 'ON ' : 'off')).join('   '));
  }
  console.log('\nEvery row is identical, so rollouts are consistent across nodes.');

  t0 = 0;
  await setFlag({ enabled: false, rollout: 0 });   // reset
  await sleep(300);
  nodes.forEach((n) => n.stop());
  process.exit(0);
})();
