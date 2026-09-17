const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* Pull the real statusOf() out of options.js and exercise its precedence
   against the precedence observer.js actually applies. */
const fs = require('fs');
const src = fs.readFileSync(ROOT + 'src/options/options.js', 'utf8');

const m = src.match(/function statusOf\(ch\) \{[\s\S]*?\n  \}/);
if (!m) { console.error('FAIL: could not locate statusOf in options.js'); process.exit(1); }

let state;
const BEEJ = { countryName: c => ({ IN: 'India', US: 'United States', NP: 'Nepal' }[c] || c) };
const statusOf = new Function('BEEJ', 'getState',
  'return (' + m[0].replace('function statusOf', 'function') + ');'
)(BEEJ, () => state);

// statusOf closes over `state`; re-bind per case.
function run(label, s, ch, expectLabel, expectBlocked) {
  state = s;
  const onlyMode = () => s.mode === 'only';
  const fn = new Function('BEEJ', 'state', 'onlyMode',
    'return (' + m[0].replace('function statusOf', 'function') + ');')(BEEJ, s, onlyMode);
  const got = fn(ch);
  const blocked = got.cls === 'bad';
  const ok = got.label === expectLabel && blocked === expectBlocked;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label +
    '  -> ' + JSON.stringify(got.label) + ' blocked=' + blocked +
    (ok ? '' : '   EXPECTED ' + JSON.stringify(expectLabel) + ' blocked=' + expectBlocked));
  return ok;
}

const base = { allowlist: [], blocklist: [], countries: [], blockUnknownCountry: false };
const IN = { key: '@x', country: 'IN' };
const NONE = { key: '@x', country: null };

let all = true;
all &= run('allowlist beats an explicit block',
  { ...base, allowlist: ['@x'], blocklist: ['@x'] }, IN, 'never hidden', false);
all &= run('allowlist beats a country rule',
  { ...base, allowlist: ['@x'], countries: ['IN'] }, IN, 'never hidden', false);
all &= run('explicit block beats country being fine',
  { ...base, blocklist: ['@x'] }, IN, 'would hide: blocked channel', true);
all &= run('country rule blocks',
  { ...base, countries: ['IN'] }, IN, 'would hide: India', true);
all &= run('country rule ignores other countries',
  { ...base, countries: ['US'] }, IN, 'India', false);
all &= run('unknown country shown by default',
  { ...base, countries: ['IN'] }, NONE, 'no country declared', false);
all &= run('unknown country blocked when opted in',
  { ...base, blockUnknownCountry: true }, NONE, 'would hide: no country', true);
all &= run('allowlist beats blockUnknownCountry',
  { ...base, allowlist: ['@x'], blockUnknownCountry: true }, NONE, 'never hidden', false);

console.log(all ? '\nALL PASS' : '\nFAILURES');
process.exit(all ? 0 : 1);
