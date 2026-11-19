const fs = require('fs');
const { FlagClient } = require('../sdk/flagstream-sdk');
const BASE = process.env.BASE_URL || 'http://localhost:3000';
const ADMIN = process.env.ADMIN_KEY || 'demo-admin-key';
const BACKUP = '/tmp/flagstream-demo-backup.json';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const show = (v) => (v ? 'NEW checkout' : 'OLD checkout');

async function setFlag(body) {
  await fetch(BASE + '/flags/new-checkout', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'x-admin-key': ADMIN },
    body: JSON.stringify(body)
  });
}

(async () => {
  try { fs.unlinkSync(BACKUP); } catch (e) {}

  // ---------- Part 1: flag switched OFF in the middle of a transaction ----------
  console.log('PART 1: flag switched off during a transaction\n');
  await setFlag({ enabled: true, rollout: 100 });
  const node = new FlagClient({ baseUrl: BASE, name: 'node-A', backupFile: BACKUP });
  await node.start();
  await sleep(300);

  const tx = node.startTransaction();                       // order #1 begins
  console.log('Order #1 starts      ->', show(tx.isEnabled('new-checkout', { userId: 'alice' })));

  await setFlag({ enabled: false });                        // admin kills the flag
  await sleep(500);
  console.log('Admin turned the flag OFF (node already received it)');

  console.log('Order #1 still running ->', show(tx.isEnabled('new-checkout', { userId: 'alice' })), '(pinned, finishes safely)');
  tx.end();

  const tx2 = node.startTransaction();                      // order #2 begins after the switch
  console.log('Order #2 starts      ->', show(tx2.isEnabled('new-checkout', { userId: 'alice' })), '(sees the change)');
  tx2.end();
  node.stop();

  // ---------- Part 2: backup when the server is unreachable ----------
  console.log('\nPART 2: server down, node restarts from backup\n');
  const lonely = new FlagClient({ baseUrl: 'http://localhost:9', name: 'node-B', backupFile: BACKUP });
  await lonely.start();
  console.log('node-B has dark-mode =', lonely.isEnabled('dark-mode', { userId: 'alice' }), '(served from backup file)');
  lonely.stop();

  await setFlag({ enabled: false, rollout: 0 });            // reset seed state
  process.exit(0);
})();
