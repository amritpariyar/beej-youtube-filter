#!/usr/bin/env node
/* Issue Beej Pro licence keys.

     node tools/licence.js init           make the signing key pair (once)
     node tools/licence.js issue <email>  print a key for one buyer
     node tools/licence.js check <key>    verify a key against the public key

   The private key lives in private/, which is git-ignored. Back it up: every
   key ever sold verifies against its public half, so losing it means keys
   issued afterwards will not match what shipped extensions expect. */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PRIVATE_DIR = path.join(ROOT, 'private');
const KEY_FILE = path.join(PRIVATE_DIR, 'licence-signing-key.pem');
const LICENCE_JS = path.join(ROOT, 'src', 'shared', 'licence.js');
const PREFIX = 'BEEJ1';

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function writePublicKey(jwk) {
  const src = fs.readFileSync(LICENCE_JS, 'utf8');
  const literal = JSON.stringify({ kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y });
  const next = src.replace(/var PUBLIC_KEY = [^;]*;/, 'var PUBLIC_KEY = ' + literal + ';');
  if (next === src && !src.includes(literal)) throw new Error('PUBLIC_KEY line not found in licence.js');
  fs.writeFileSync(LICENCE_JS, next);
}

function loadPrivateKey() {
  if (!fs.existsSync(KEY_FILE)) {
    console.error('No signing key at ' + KEY_FILE + '. Run `node tools/licence.js init` first.');
    process.exit(1);
  }
  return crypto.createPrivateKey(fs.readFileSync(KEY_FILE));
}

function init() {
  if (fs.existsSync(KEY_FILE)) {
    console.error('Refusing to overwrite ' + KEY_FILE + '. Keys already sold depend on it.');
    process.exit(1);
  }
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  fs.mkdirSync(PRIVATE_DIR, { recursive: true });
  fs.writeFileSync(KEY_FILE, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  writePublicKey(publicKey.export({ format: 'jwk' }));
  console.log('Signing key written to ' + path.relative(ROOT, KEY_FILE) + ' (back it up).');
  console.log('Public key written into ' + path.relative(ROOT, LICENCE_JS) + '.');
}

function issue(email, tier) {
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email)) {
    console.error('Usage: node tools/licence.js issue <email>');
    process.exit(1);
  }
  const payload = { e: email.toLowerCase(), t: tier || 'pro', d: new Date().toISOString().slice(0, 10) };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.sign('sha256', Buffer.from(body), {
    key: loadPrivateKey(),
    dsaEncoding: 'ieee-p1363'   // raw r||s, which is what WebCrypto verifies
  });
  console.log([PREFIX, body, b64url(sig)].join('.'));
}

function check(key) {
  const parts = String(key || '').replace(/\s+/g, '').split('.');
  if (parts.length !== 3 || parts[0] !== PREFIX) {
    console.log('INVALID (not a Beej key)');
    process.exit(1);
  }
  const pub = crypto.createPublicKey(loadPrivateKey());
  const ok = crypto.verify('sha256', Buffer.from(parts[1]),
    { key: pub, dsaEncoding: 'ieee-p1363' }, Buffer.from(parts[2], 'base64url'));
  console.log(ok ? 'VALID  ' + Buffer.from(parts[1], 'base64url').toString() : 'INVALID (bad signature)');
  process.exit(ok ? 0 : 1);
}

const [cmd, arg, arg2] = process.argv.slice(2);
if (cmd === 'init') init();
else if (cmd === 'issue') issue(arg, arg2);
else if (cmd === 'check') check(arg);
else {
  console.error('Usage: node tools/licence.js init | issue <email> | check <key>');
  process.exit(1);
}
