const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* The only-mode watchdog hides a tile whose country lookup has not landed yet.
   That hide is a guess, and a verdict arriving afterwards has to be able to
   overturn it -- otherwise an allowed channel is hidden for good the first time
   it is seen, which is exactly what happened before beej-provisional existed.
   Loads the real enforce.js and drives it with a fake element. */
const fs = require('fs');

const src = fs.readFileSync(ROOT + 'src/content/enforce.js', 'utf8');
// These tiles sit in no shelf; test_shelf covers the ones that do.
const ENFORCE = new Function('document', 'BEEJ_EXTRACT', src + '\nreturn BEEJ_ENFORCE;')({
  getElementById: () => null,
  querySelectorAll: () => []
}, { shelfFor: () => null });

function tile() {
  const set = new Set();
  return {
    classList: {
      add: (...c) => c.forEach(x => set.add(x)),
      remove: (...c) => c.forEach(x => set.delete(x)),
      contains: c => set.has(c)
    },
    setAttribute() {},
    removeAttribute() {},
    has: c => set.has(c)
  };
}

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + extra));
  if (!cond) ok = false;
}

// A lookup that lands after the watchdog and says "allowed" must win.
let t = tile();
ENFORCE.markPending(t);
ENFORCE.holdHidden(t);
check('watchdog hides while the verdict is outstanding',
  t.has('beej-hidden') && t.has('beej-provisional'));
check('watchdog clears pending', !t.has('beej-pending'));
ENFORCE.release(t);
check('a later "show" verdict overturns the provisional hide', !t.has('beej-hidden'));
check('and clears the provisional marker', !t.has('beej-provisional'));

// A lookup that lands after the watchdog and says "hide" must stick, and stop
// being provisional -- it is a verdict now, not a guess.
t = tile();
ENFORCE.holdHidden(t);
ENFORCE.hide(t, 'not an allowed country (US)', '@someone');
check('a later "hide" verdict keeps it hidden', t.has('beej-hidden'));
check('and promotes it out of provisional', !t.has('beej-provisional'));

// release() must never undo a real block: it is only ever called on the path
// where the verdict allows the tile, but the class check is what guarantees it.
t = tile();
ENFORCE.hide(t, 'blocked channel', '@someone');
ENFORCE.release(t);
check('release leaves a real block hidden', t.has('beej-hidden'));

// show() is the "Show anyway" path and clears everything.
t = tile();
ENFORCE.holdHidden(t);
ENFORCE.show(t);
check('show clears a provisional hide', !t.has('beej-hidden') && !t.has('beej-provisional'));

/* The watchdog only helps if it outlasts a cold country lookup, measured at
   600-800ms against YouTube's About page. */
const obs = fs.readFileSync(ROOT + 'src/content/observer.js', 'utf8');
const ms = Number((obs.match(/PENDING_MS = (\d+)/) || [])[1]);
check('watchdog outlasts a cold country lookup', ms >= 1000, 'PENDING_MS = ' + ms);

// And the watchdog must go through enforce rather than setting classes itself,
// or the provisional marker silently stops being applied.
check('watchdog defers to enforce.holdHidden',
  obs.includes('BEEJ_ENFORCE.holdHidden(stuck[i])'),
  'armPendingWatchdog sets classes itself again');

process.exit(ok ? 0 : 1);
