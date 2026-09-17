const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* Devanagari carries Hindi, Marathi and Nepali. Confirm the new pass narrows
   to the real one when CLD is confident, and keeps the whole set when it is
   not -- the difference between a Nepali user losing Nepali content or not. */
const fs = require('fs');

let cldReply = null;   // set per case
global.chrome = {
  i18n: {
    detectLanguage(text, cb) {
      cb(cldReply ? JSON.parse(JSON.stringify(cldReply)) : null);
    }
  },
  runtime: { lastError: null }
};

new Function(
  fs.readFileSync(ROOT + 'src/shared/data.js', 'utf8') + ';globalThis.BEEJ_DATA=BEEJ_DATA;' +
  fs.readFileSync(ROOT + 'src/content/lang.js', 'utf8') + ';globalThis.BEEJ_LANG=BEEJ_LANG;'
)();
const L = globalThis.BEEJ_LANG;

const HINDI = '\u0915\u094d\u092f\u093e \u0939\u094b\u0917\u093e \u0905\u092c \u092f\u0939 \u0926\u0947\u0916\u094b';
const JAPANESE = '\u65e5\u672c\u306e\u98df\u3079\u7269\u3092\u98df\u3079\u3066\u307f\u305f';

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + extra));
  if (!cond) ok = false;
}

(async () => {
  // 1. CLD confidently says Nepali -> narrow to ne alone.
  cldReply = { isReliable: true, languages: [{ language: 'ne', percentage: 92 }] };
  let v = await L.detect(HINDI, 70);
  check('confident CLD narrows Devanagari to one language',
    v.langs.length === 1 && v.langs[0] === 'ne', JSON.stringify(v));
  check('narrowed verdict is NOT caught by a Hindi block',
    L.isBlocked(v, ['hi']) === null, JSON.stringify(L.isBlocked(v, ['hi'])));
  check('narrowed verdict IS caught by a Nepali block',
    L.isBlocked(v, ['ne']) === 'ne', JSON.stringify(L.isBlocked(v, ['ne'])));

  // 2. CLD unsure -> keep the whole script set, so a Hindi block still catches it.
  cldReply = { isReliable: false, languages: [{ language: 'ne', percentage: 40 }] };
  v = await L.detect(HINDI, 70);
  check('unsure CLD keeps the full script set',
    v.langs.join(',') === 'hi,mr,ne', JSON.stringify(v));
  check('unnarrowed set is caught by a Hindi block',
    L.isBlocked(v, ['hi']) === 'hi', JSON.stringify(v));

  // 3. CLD answers outside the script's candidates -> ignore it, trust script.
  cldReply = { isReliable: true, languages: [{ language: 'en', percentage: 99 }] };
  v = await L.detect(HINDI, 70);
  check('CLD answer outside the script set is rejected',
    v.langs.join(',') === 'hi,mr,ne', JSON.stringify(v));

  // 4. Unambiguous script never consults CLD at all.
  cldReply = { isReliable: true, languages: [{ language: 'zz', percentage: 99 }] };
  v = await L.detect(JAPANESE, 70);
  check('unambiguous script short-circuits',
    v.langs.join(',') === 'ja' && v.source === 'script:kana', JSON.stringify(v));

  console.log(ok ? '\nALL PASS' : '\nFAILURES');
  process.exit(ok ? 0 : 1);
})();
