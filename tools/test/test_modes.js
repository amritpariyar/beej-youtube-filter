const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* Pull the real countryVerdict/languageVerdict out of observer.js and check
   both modes, including the traps: empty selections in only-mode must not
   blank the feed, and the unknown-handling defaults are opposite per mode. */
const fs = require('fs');
const src = fs.readFileSync(ROOT + 'src/content/observer.js', 'utf8');

function grab(name) {
  const m = src.match(new RegExp('function ' + name + '\\([^)]*\\) \\{[\\s\\S]*?\\n  \\}'));
  if (!m) throw new Error('could not find ' + name);
  return m[0];
}

const BODY = ['onlyMode', 'onlyRulesActive', 'countryRuleActive', 'languageRuleActive',
  'countryVerdict', 'languageVerdict'].map(grab).join('\n');

function build(settings) {
  const BEEJ = {
    countryName: c => ({ IN: 'India', NP: 'Nepal', US: 'United States' }[c] || c),
    languageName: c => ({ ne: 'Nepali', hi: 'Hindi', en: 'English' }[c] || c)
  };
  const BEEJ_LANG = {
    isBlocked(v, blocked) {
      if (!v || !blocked || !blocked.length) return null;
      for (const l of v.langs) if (blocked.includes(l)) return l;
      return null;
    }
  };
  return new Function('settings', 'BEEJ', 'BEEJ_LANG',
    BODY + '\nreturn {onlyMode,onlyRulesActive,countryRuleActive,languageRuleActive,countryVerdict,languageVerdict};'
  )(settings, BEEJ, BEEJ_LANG);
}

const base = {
  mode: 'block', countries: [], languages: [],
  blockUnknownCountry: false, onlyShowUnknown: false
};

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + extra));
  if (!cond) ok = false;
}

// ---------------- block mode (unchanged behaviour) ----------------
let a = build({ ...base, countries: ['IN'], languages: ['hi'] });
check('block: listed country hides', a.countryVerdict('IN').hide === true);
check('block: other country stays', a.countryVerdict('NP').hide === false);
check('block: unknown country stays by default', a.countryVerdict(null).hide === false);
check('block: listed language hides', a.languageVerdict({ langs: ['hi'] }).hide === true);
check('block: other language stays', a.languageVerdict({ langs: ['ne'] }).hide === false);
check('block: undetected language stays', a.languageVerdict(null).hide === false);

a = build({ ...base, blockUnknownCountry: true });
check('block: unknown country hides when opted in', a.countryVerdict(null).hide === true);
check('block: blockUnknownCountry alone activates the country rule',
  a.countryRuleActive() === true);

// ---------------- only mode ----------------
let o = build({ ...base, mode: 'only', languages: ['ne'] });
check('only: selected language is kept', o.languageVerdict({ langs: ['ne'] }).hide === false);
check('only: unselected language is hidden', o.languageVerdict({ langs: ['en'] }).hide === true);
check('only: undetected language hidden by default', o.languageVerdict(null).hide === true);
check('only: a multi-language verdict passes if ANY member is selected',
  o.languageVerdict({ langs: ['hi', 'mr', 'ne'] }).hide === false);
check('only: country rule inactive when no country chosen',
  o.countryRuleActive() === false);

o = build({ ...base, mode: 'only', languages: ['ne'], onlyShowUnknown: true });
check('only: undetected language kept when unknowns are kept',
  o.languageVerdict(null).hide === false);

o = build({ ...base, mode: 'only', countries: ['NP'] });
check('only: selected country kept', o.countryVerdict('NP').hide === false);
check('only: unselected country hidden', o.countryVerdict('IN').hide === true);
check('only: undeclared country hidden by default', o.countryVerdict(null).hide === true);
check('only: hidden label names the offending country',
  /India/.test(o.countryVerdict('IN').label), o.countryVerdict('IN').label);

o = build({ ...base, mode: 'only', countries: ['NP'], onlyShowUnknown: true });
check('only: undeclared country kept when unknowns are kept',
  o.countryVerdict(null).hide === false);

// ---------------- the trap: only-mode with nothing selected ----------------
o = build({ ...base, mode: 'only' });
check('only: no selections means no rules are active (feed must not blank)',
  o.onlyRulesActive() === false);
check('only: no selections leaves both dimensions inactive',
  o.countryRuleActive() === false && o.languageRuleActive() === false);

// ---------------- block mode never treats itself as only ----------------
a = build({ ...base, countries: ['IN'] });
check('block: onlyMode is false', a.onlyMode() === false);
check('block: onlyRulesActive irrelevant but truthy-safe',
  typeof a.onlyRulesActive() === 'boolean');

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
