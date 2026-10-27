const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* Watch and Shorts pages are judged by the video id in the URL, resolved to a
   channel through oEmbed. Run the real extract.js and util.js against stubbed
   locations and oEmbed responses. */
const fs = require('fs');
const vm = require('vm');

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + extra));
  if (!cond) ok = false;
}

const loc = { pathname: '/', search: '' };
let fetched = [];
let respond = () => ({ ok: false, status: 404 });

const ctx = {
  location: loc,
  URLSearchParams,
  console,
  chrome: { storage: { sync: {}, local: {} }, runtime: {} },
  fetch: (url) => {
    fetched.push(url);
    const r = respond(url);
    if (r instanceof Error) return Promise.reject(r);
    return Promise.resolve({ ok: r.ok, status: r.status, json: () => Promise.resolve(r.body) });
  }
};
ctx.self = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(ROOT + 'src/shared/data.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(ROOT + 'src/shared/util.js', 'utf8'), ctx);
vm.runInContext(fs.readFileSync(ROOT + 'src/content/extract.js', 'utf8'), ctx);
const X = ctx.BEEJ_EXTRACT;
const B = ctx.BEEJ;

function at(pathname, search) { loc.pathname = pathname; loc.search = search || ''; }

// 1. Video id from the URL.
at('/watch', '?v=QEM3EHUV5ko&t=30s');
check('watch page id', X.currentVideoId() === 'QEM3EHUV5ko', X.currentVideoId());
check('watch page is not Shorts', X.isShortsPage() === false, '');
at('/shorts/94lO1_o6GNA');
check('Shorts page id', X.currentVideoId() === '94lO1_o6GNA', X.currentVideoId());
check('Shorts page is Shorts and a watch page', X.isShortsPage() && X.isWatchPage(), '');
at('/watch', '?list=PL123');
check('watch page without v= has no id', X.currentVideoId() === null, X.currentVideoId());
at('/watch', '?v=short');
check('malformed id is rejected', X.currentVideoId() === null, X.currentVideoId());
at('/@YouTube/videos');
check('channel page has no id', X.currentVideoId() === null, X.currentVideoId());

(async () => {
  // 2. oEmbed: a collaboration names its uploader.
  respond = () => ({ ok: true, status: 200, body: {
    title: '  How @haleypham ascended the throne  ',
    author_name: 'YouTube', author_url: 'https://www.youtube.com/@YouTube' } });
  fetched = [];
  let v = await B.fetchVideoOwner('QEM3EHUV5ko');
  check('owner key is the lowercased handle', v && v.key === '@youtube', JSON.stringify(v));
  check('title is trimmed', v && v.title === 'How @haleypham ascended the throne', JSON.stringify(v));
  check('asks oEmbed on www.youtube.com for that video',
    fetched.length === 1 && fetched[0].indexOf('https://www.youtube.com/oembed?') === 0 &&
    decodeURIComponent(fetched[0]).indexOf('watch?v=QEM3EHUV5ko') !== -1, fetched[0]);

  // 3. A /channel/ author URL works too.
  respond = () => ({ ok: true, status: 200, body: {
    title: 't', author_url: 'https://www.youtube.com/channel/UCBR8-60-B28hp2BmDPdntcQ' } });
  v = await B.fetchVideoOwner('aaaaaaaaaaa');
  check('channel-id author URL', v && v.key === 'UCBR8-60-B28hp2BmDPdntcQ', JSON.stringify(v));

  // 4. Refusals and failures resolve to null rather than throwing.
  respond = () => ({ ok: false, status: 401 });
  check('embedding disabled gives null', (await B.fetchVideoOwner('aaaaaaaaaaa')) === null, '');
  respond = () => new Error('offline');
  check('network error gives null', (await B.fetchVideoOwner('aaaaaaaaaaa')) === null, '');
  respond = () => ({ ok: true, status: 200, body: { title: 't' } });
  check('no author URL gives null', (await B.fetchVideoOwner('aaaaaaaaaaa')) === null, '');

  console.log(ok ? '\nALL PASS' : '\nFAILURES');
  process.exit(ok ? 0 : 1);
})();
