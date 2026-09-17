const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* Exercise the real renderRulesSummary() from options.js against a fake DOM
   node, to confirm the "nothing is set" case is actually reachable and worded
   usefully. */
const fs = require('fs');
const src = fs.readFileSync(ROOT + 'src/options/options.js', 'utf8');

const m = src.match(/function renderRulesSummary\(\) \{[\s\S]*?\n  \}/);
if (!m) { console.error('FAIL: renderRulesSummary not found'); process.exit(1); }

function run(label, state, expectText, expectErr) {
  const el = { textContent: '', className: '' };
  const $ = () => el;
  const onlyMode = () => state.mode === 'only';
  const fn = new Function('state', '$', 'onlyMode',
    'return (' + m[0].replace('function renderRulesSummary', 'function') + ');')(state, $, onlyMode);
  fn();
  const isErr = el.className.indexOf('err') !== -1;
  const ok = el.textContent.indexOf(expectText) !== -1 && isErr === expectErr;
  console.log((ok ? 'PASS  ' : 'FAIL  ') + label + '\n        ' + JSON.stringify(el.textContent) +
    (ok ? '' : '\n        EXPECTED to contain ' + JSON.stringify(expectText) + ' err=' + expectErr));
  return ok;
}

const base = {
  enabled: true, countries: [], languages: [],
  blocklist: [], blockUnknownCountry: false
};

let ok = true;
ok &= run('nothing configured warns clearly', { ...base },
  'No rules set yet', true);
ok &= run('disabled beats everything',
  { ...base, enabled: false, countries: ['IN'] }, 'Filtering is off', true);
ok &= run('one country', { ...base, countries: ['IN'] },
  'Blocking 1 country.', false);
ok &= run('plurals', { ...base, countries: ['IN', 'US'], languages: ['hi'] },
  'Blocking 2 countries, 1 language.', false);
ok &= run('all four kinds',
  { ...base, countries: ['IN'], languages: ['hi', 'ne'], blocklist: ['@a'], blockUnknownCountry: true },
  'Blocking 1 country, 2 languages, 1 channel, channels with no country.', false);
ok &= run('unknown-country alone still counts as a rule',
  { ...base, blockUnknownCountry: true }, 'channels with no country', false);

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
