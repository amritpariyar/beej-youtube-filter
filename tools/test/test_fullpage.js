const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* blockFullPage() used to show the block card without recording anything, so a
   watch-page or channel-page block never reached "What has been blocked".
   Confirm every branch now logs, with the right kind and detail. */
const fs = require('fs');
const src = fs.readFileSync(ROOT + 'src/content/observer.js', 'utf8');

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + extra));
  if (!cond) ok = false;
}

// 1. blockFullPage logs.
const fnBody = src.match(/function blockFullPage\([\s\S]*?\n  \}/);
check('blockFullPage exists', !!fnBody, 'not found');
check('blockFullPage calls logBlock',
  fnBody && /logBlock\(info, kind, detail\)/.test(fnBody[0]),
  fnBody ? fnBody[0].slice(0, 200) : '');

// 2. Every call site passes a kind.
const calls = src.match(/blockFullPage\([^;]*?\);/g) || [];
check('three call sites found', calls.length === 3, 'got ' + calls.length + ': ' + JSON.stringify(calls));
// One literal 'manual' site, plus the language and country sites which pass the
// verdict's own kind through.
const hasManual = calls.some(c => /'manual'/.test(c));
const hasLang = calls.some(c => /lv\.kind/.test(c));
const hasCountry = calls.some(c => /cv\.kind/.test(c));
check('call sites cover manual, language and country',
  hasManual && hasLang && hasCountry,
  JSON.stringify({ hasManual, hasLang, hasCountry, calls }));

// 3. The title is resolved before the manual branch uses it (it used to be
//    declared after, which would have logged an empty title).
const chk = src.match(/function checkFullPage\(\)[\s\S]*?\n  \}\n/);
const titleAt = chk[0].indexOf('var title =');
const manualAt = chk[0].indexOf('blockedChannel(key)');
check('title is computed before the manual-block branch',
  titleAt !== -1 && titleAt < manualAt, 'title@' + titleAt + ' manual@' + manualAt);

// 4. Full-page language verdicts feed the tally too.
check('checkFullPage tallies the language it detected',
  /tallyLang\(verdict\)/.test(chk[0]), 'missing tallyLang in checkFullPage');

// 5. The worker must keep the port open for log writes.
const w = fs.readFileSync(ROOT + 'src/background/worker.js', 'utf8');
const logHandler = w.match(/beej:logBlocks'[\s\S]*?\n  \}/)[0];
check('logBlocks responds so the worker stays alive',
  /sendResponse\(\{ ok: true \}\)/.test(logHandler) && /return true;/.test(logHandler),
  logHandler.slice(-160));
const tallyHandler = w.match(/beej:logLangs'[\s\S]*?\n  \}/)[0];
check('logLangs responds so the worker stays alive',
  /sendResponse\(\{ ok: true \}\)/.test(tallyHandler) && /return true;/.test(tallyHandler),
  tallyHandler.slice(-160));

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
