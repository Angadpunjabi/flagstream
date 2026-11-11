const fs = require('fs');
const path = require('path');

const FILE = process.env.DATA_FILE || path.join(__dirname, 'flags.json');
let state = { version: 1, flags: {} };
const listeners = new Set();

function load() {
  try { state = JSON.parse(fs.readFileSync(FILE, 'utf8')); }
  catch (e) { state = { version: 1, flags: {} }; }
}
function save() {
  try { fs.writeFileSync(FILE, JSON.stringify(state, null, 2)); }
  catch (e) { console.error('persist failed:', e.message); }
}
function notify() { for (const fn of listeners) fn(state); }

function snapshot() { return state; }
function upsert(flag) {
  state.flags[flag.key] = { ...state.flags[flag.key], ...flag, updatedAt: new Date().toISOString() };
  state.version++;
  save();
  notify();
  return state.flags[flag.key];
}
function remove(key) {
  delete state.flags[key];
  state.version++;
  save();
  notify();
}
function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

load();
module.exports = { snapshot, upsert, remove, subscribe };
