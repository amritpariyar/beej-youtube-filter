const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* Load the real worker.js against a fake chrome API and drive the block-log
   message handlers the way the content script does. */
const fs = require('fs');

const store = {};
let listener = null;

global.chrome = {
  runtime: {
    onMessage: { addListener: fn => { listener = fn; } },
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    getManifest: () => ({ content_scripts: [{ js: [], css: [] }] }),
    lastError: null,
    openOptionsPage() {}
  },
  storage: {
    local: {
      get(key, cb) {
        if (key === null) return cb({ ...store });
        const k = typeof key === 'string' ? key : key[0];
        cb(k in store ? { [k]: store[k] } : {});
      },
      set(obj, cb) { Object.assign(store, obj); if (cb) cb(); },
      remove(keys, cb) {
        (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]);
        if (cb) cb();
      }
    },
    sync: { get: (d, cb) => cb(d), set: (p, cb) => cb && cb() },
    onChanged: { addListener() {} }
  },
  contextMenus: { removeAll: cb => cb(), create() {}, onClicked: { addListener() {} } },
  tabs: { query: (q, cb) => cb([]), sendMessage() {} },
  action: { onClicked: { addListener() {} } },
  scripting: {}
};
global.importScripts = (...fs_) => fs_.forEach(f =>
  new Function(fs.readFileSync(ROOT + f.replace(/^\//, ''), 'utf8'))());
global.self = global;
global.fetch = () => Promise.reject(new Error('no network in test'));

new Function(fs.readFileSync(ROOT + 'src/background/worker.js', 'utf8'))();

const send = (msg, cb) => listener(msg, { tab: { id: 1 } }, cb || (() => {}));

// Two batches, with an intentional duplicate of the first entry.
send({
  type: 'beej:logBlocks', entries: [
    { key: '@a', name: 'A', title: 'Hindi video', kind: 'language', detail: 'hi', ts: 100 },
    { key: '@b', name: 'B', title: 'Indian video', kind: 'country', detail: 'IN', ts: 200 }
  ]
});
send({
  type: 'beej:logBlocks', entries: [
    { key: '@a', name: 'A', title: 'Hindi video', kind: 'language', detail: 'hi', ts: 300 },
    { key: '@c', name: 'C', title: 'Manual one', kind: 'manual', detail: '', ts: 400 }
  ]
});

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + extra));
  if (!cond) ok = false;
}

send({ type: 'beej:blockLog' }, res => {
  const e = res.entries;
  check('deduped repeat of the same video', e.length === 3, 'got ' + e.length);
  check('newest first', e[0].ts === 400 && e[2].ts === 100, JSON.stringify(e.map(x => x.ts)));
  check('kinds preserved',
    e.map(x => x.kind).sort().join(',') === 'country,language,manual',
    JSON.stringify(e.map(x => x.kind)));
  check('language detail kept', e.find(x => x.kind === 'language').detail === 'hi');
  check('country detail kept', e.find(x => x.kind === 'country').detail === 'IN');
});

// Cap enforcement.
const many = [];
for (let i = 0; i < 500; i++) many.push({ key: '@k' + i, name: 'n', title: 't' + i, kind: 'country', detail: 'IN', ts: i });
send({ type: 'beej:logBlocks', entries: many });
send({ type: 'beej:blockLog' }, res => {
  check('capped at 400', res.entries.length === 400, 'got ' + res.entries.length);
  check('cap keeps the newest', res.entries[0].ts === 499, 'got ' + res.entries[0].ts);
});

// Clearing the country cache must not wipe the log.
store['c:@z'] = { country: 'IN', ts: Date.now() };
send({ type: 'beej:clearCache' }, () => {
  send({ type: 'beej:blockLog' }, res => {
    check('clearCache leaves the block log alone', res.entries.length === 400, 'got ' + res.entries.length);
  });
});

send({ type: 'beej:clearBlockLog' }, () => {
  send({ type: 'beej:blockLog' }, res => {
    check('clearBlockLog empties it', res.entries.length === 0, 'got ' + res.entries.length);
  });
});

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
