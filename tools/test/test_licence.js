const ROOT = require('path').resolve(__dirname, '../..') + '/';
/* Run the real licence.js against keys signed the way tools/licence.js signs
   them. A throwaway key pair stands in for the real one, so this needs nothing
   from private/. */
const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = publicKey.export({ format: 'jwk' });

let src = fs.readFileSync(ROOT + 'src/shared/licence.js', 'utf8');
check('licence.js has a PUBLIC_KEY line', /var PUBLIC_KEY = [^;]*;/.test(src), '');
src = src.replace(/var PUBLIC_KEY = [^;]*;/, 'var PUBLIC_KEY = ' + JSON.stringify(jwk) + ';');

const ctx = { crypto: globalThis.crypto, atob, btoa, TextEncoder, TextDecoder };
vm.runInNewContext(src, ctx);
const L = ctx.BEEJ_LICENCE;

function sign(payload, key) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.sign('sha256', Buffer.from(body), { key: key || privateKey, dsaEncoding: 'ieee-p1363' });
  return 'BEEJ1.' + body + '.' + sig.toString('base64url');
}

let ok = true;
function check(label, cond, extra) {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + label + (cond ? '' : '   ' + extra));
  if (!cond) ok = false;
}

(async () => {
  const good = sign({ e: 'a@b.np', t: 'pro', d: '2026-10-04' });
  const p = await L.verify(good);
  check('genuine key verifies', p && p.e === 'a@b.np', JSON.stringify(p));

  const wrapped = good.slice(0, 30) + '\n  ' + good.slice(30, 90) + ' ' + good.slice(90);
  check('key pasted with line breaks still verifies', !!(await L.verify(wrapped)), '');

  const parts = good.split('.');
  const forged = 'BEEJ1.' + Buffer.from(JSON.stringify({ e: 'x@y.np', t: 'pro' })).toString('base64url') + '.' + parts[2];
  check('edited payload is rejected', (await L.verify(forged)) === null, '');

  const other = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey;
  check('key from another signer is rejected',
    (await L.verify(sign({ e: 'a@b.np' }, other))) === null, '');

  for (const junk of ['', 'hello', 'BEEJ1.', 'BEEJ1.a.b', 'BEEJ2.' + parts[1] + '.' + parts[2], null]) {
    check('junk rejected: ' + JSON.stringify(junk), (await L.verify(junk)) === null, '');
  }

  process.exit(ok ? 0 : 1);
})();
