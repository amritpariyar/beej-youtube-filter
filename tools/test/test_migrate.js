const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* The two selection lists were renamed (blockedCountries -> countries). Run the
   real getSettings() against a fake sync store and confirm an existing config
   survives, migrates once, and leaves nothing stale behind. */
const fs = require('fs');

function makeChrome(store) {
  return {
    storage: {
      sync: {
        get(defaults, cb) {
          const out = {};
          for (const k of Object.keys(defaults)) {
            out[k] = (k in store) ? store[k] : defaults[k];
          }
          cb(out);
        },
        set(patch, cb) { Object.assign(store, patch); if (cb) cb(); },
        remove(keys, cb) {
          (Array.isArray(keys) ? keys : [keys]).forEach(k => delete store[k]);
          if (cb) cb();
        }
      },
      local: { get: (k, cb) => cb({}), set: (o, cb) => cb && cb() }
    }
  };
}

function load(store) {
  global.chrome = makeChrome(store);
  global.self = global;
  const ctx = {};
  new Function('globalThis',
    fs.readFileSync(ROOT + 'src/shared/data.js', 'utf8') + ';globalThis.BEEJ_DATA=BEEJ_DATA;' +
    fs.readFileSync(ROOT + 'src/shared/util.js', 'utf8') + ';globalThis.BEEJ=BEEJ;'
  )(global);
  return global.BEEJ;
}

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + extra));
  if (!cond) ok = false;
}

(async () => {
  // 1. An existing pre-mode config.
  const store = {
    blockedCountries: ['IN', 'US'],
    blockedLanguages: ['hi'],
    allowlist: ['@veritasium']
  };
  let BEEJ = load(store);
  let s = await BEEJ.getSettings();

  check('countries carried over', JSON.stringify(s.countries) === '["IN","US"]', JSON.stringify(s.countries));
  check('languages carried over', JSON.stringify(s.languages) === '["hi"]', JSON.stringify(s.languages));
  check('unrelated settings untouched', JSON.stringify(s.allowlist) === '["@veritasium"]');
  check('mode defaults to block', s.mode === 'block', s.mode);
  check('legacy keys removed from storage',
    !('blockedCountries' in store) && !('blockedLanguages' in store), JSON.stringify(Object.keys(store)));
  check('new keys persisted', JSON.stringify(store.countries) === '["IN","US"]', JSON.stringify(store.countries));
  check('legacy keys not leaked onto the settings object',
    !('blockedCountries' in s) && !('blockedLanguages' in s), JSON.stringify(Object.keys(s)));

  // 2. Second read is a no-op (migration must not loop or re-run).
  const before = JSON.stringify(store);
  s = await BEEJ.getSettings();
  check('second read changes nothing', JSON.stringify(store) === before);
  check('second read still has the values', JSON.stringify(s.countries) === '["IN","US"]');

  // 3. A fresh install has no legacy keys at all.
  const fresh = {};
  BEEJ = load(fresh);
  s = await BEEJ.getSettings();
  check('fresh install defaults are empty',
    s.countries.length === 0 && s.languages.length === 0 && s.mode === 'block');
  check('fresh install writes nothing', Object.keys(fresh).length === 0, JSON.stringify(fresh));

  // 4. A user who already has new-style values must not be clobbered by stale
  //    legacy keys lingering from a half-finished migration.
  const mixed = { countries: ['NP'], blockedCountries: ['IN'] };
  BEEJ = load(mixed);
  s = await BEEJ.getSettings();
  check('existing new-style value wins over a stale legacy key',
    JSON.stringify(s.countries) === '["NP"]', JSON.stringify(s.countries));

  console.log(ok ? '\nALL PASS' : '\nFAILURES');
  process.exit(ok ? 0 : 1);
})();
