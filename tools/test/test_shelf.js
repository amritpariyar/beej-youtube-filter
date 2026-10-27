const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* A Shorts shelf whose tiles are all hidden used to leave its "Shorts" heading
   standing over an empty row. Run the real extract.js and enforce.js against a
   small fake DOM: the shelf hides with its last tile and comes back with its
   first. */
const fs = require('fs');
const vm = require('vm');

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + (extra || '')));
  if (!cond) ok = false;
}

// Just enough DOM for tag-name selector lists, which is all extract.js uses
// for tiles and shelves.
function el(tag, children) {
  const classes = new Set();
  const node = {
    tagName: tag.toUpperCase(),
    parentElement: null,
    children: children || [],
    classList: {
      add: (...c) => c.forEach((x) => classes.add(x)),
      remove: (...c) => c.forEach((x) => classes.delete(x)),
      contains: (c) => classes.has(c)
    },
    attrs: {},
    setAttribute(k, v) { this.attrs[k] = v; },
    removeAttribute(k) { delete this.attrs[k]; },
    matches(sel) { return sel.split(',').some((s) => s.trim().toUpperCase() === node.tagName); },
    closest(sel) {
      for (let n = node; n; n = n.parentElement) if (n.matches(sel)) return n;
      return null;
    },
    querySelectorAll(sel) {
      const out = [];
      (function walk(n) {
        n.children.forEach((c) => { if (c.matches(sel)) out.push(c); walk(c); });
      })(node);
      return out;
    }
  };
  node.children.forEach((c) => { c.parentElement = node; });
  return node;
}

const ctx = { console, document: { getElementById: () => null, querySelectorAll: () => [] } };
ctx.self = ctx;
vm.createContext(ctx);
for (const f of ['src/shared/data.js', 'src/shared/util.js', 'src/content/extract.js', 'src/content/enforce.js']) {
  vm.runInContext(fs.readFileSync(ROOT + f, 'utf8'), ctx);
}
const E = ctx.BEEJ_ENFORCE;
const X = ctx.BEEJ_EXTRACT;
const hidden = (n) => n.classList.contains('beej-hidden');

// The search-page shape: grid-shelf-view-model > div > div > lockup.
const a = el('ytm-shorts-lockup-view-model');
const b = el('ytm-shorts-lockup-view-model');
const shelf = el('grid-shelf-view-model', [el('yt-section-header-view-model'), el('div', [el('div', [a, b])])]);

check('extract finds the shelf of a Shorts tile', X.shelfFor(a) === shelf);
check('an ordinary feed tile has no shelf',
  X.shelfFor(el('ytd-rich-grid-renderer', [el('ytd-rich-item-renderer')]).children[0]) === null);

E.hide(a, 'language: Hindi');
check('one tile hidden leaves the shelf up', !hidden(shelf));
E.hide(b, 'language: Hindi');
check('last tile hidden takes the shelf with it', hidden(shelf));
E.show(b);
check('a tile shown again brings the shelf back', !hidden(shelf));

// Only mode's provisional hide, and the verdict that overturns it.
E.hide(b, 'language: Hindi');
const c = el('ytm-shorts-lockup-view-model');
const shelf2 = el('ytd-rich-shelf-renderer', [el('div', [a, c])]);
E.hide(a, 'country: India');
E.holdHidden(c);
check('a provisional hide counts towards an empty shelf', hidden(shelf2));
E.release(c);
check('releasing it brings the shelf back', !hidden(shelf2));

// A verdict hide on the last visible tile empties it again.
E.hide(c, 'country: India');
check('home-page shelf hides too', hidden(shelf2));

console.log(ok ? '\nALL PASS' : '\nFAILURES');
process.exit(ok ? 0 : 1);
