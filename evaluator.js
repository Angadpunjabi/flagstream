// FNV-1a hash: fast, no dependencies
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function bucket(flagKey, userId) {
  return hash(flagKey + ':' + userId) % 100;
}

function evaluate(flag, ctx = {}) {
  if (!flag) return { value: false, reason: 'FLAG_NOT_FOUND' };
  if (!flag.enabled) return { value: false, reason: 'KILL_SWITCH_OFF' };
  const uid = ctx.userId || 'anonymous';
  if ((flag.allowList || []).includes(uid)) return { value: true, reason: 'ALLOW_LIST' };
  for (const r of flag.rules || []) {
    if (ctx[r.attribute] !== undefined && r.values.includes(ctx[r.attribute])) {
      return { value: true, reason: 'RULE_MATCH' };
    }
  }
  const pct = flag.rollout ?? 100;
  return bucket(flag.key, uid) < pct
    ? { value: true, reason: 'ROLLOUT' }
    : { value: false, reason: 'OUTSIDE_ROLLOUT' };
}

module.exports = { evaluate, bucket };
