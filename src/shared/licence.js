/* Beej Pro licence keys, verified entirely offline.

   A key is `BEEJ1.<payload>.<signature>`, both parts base64url. The payload is
   a small JSON object ({ e: email, t: tier, d: issue date }); the signature is
   ECDSA P-256 / SHA-256 over the payload's base64url text, made with a private
   key that never leaves the maintainer's machine (see tools/licence.js).

   Checking a key needs only the public key below, so activating Pro sends
   nothing anywhere: no licence server, no account, no phone-home. Whichever
   shop takes the payment just has to hand the buyer a key.

   Classic script: loaded by the options page. */

var BEEJ_LICENCE = (function () {
  'use strict';

  /* Written by `node tools/licence.js init`. Null means no key can verify. */
  var PUBLIC_KEY = {"kty":"EC","crv":"P-256","x":"ok88ZQI-FoQscyF5qsRpXE986Y8KfQoq7__xIGt3Eyw","y":"o5-Lde32LVMcWCOlEuu-ePAw6xz8PdkrdImz-txIItE"};

  var PREFIX = 'BEEJ1';

  function fromB64url(s) {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  /* Keys get pasted out of emails, so tolerate wrapping and stray spaces. */
  function normalise(key) {
    return String(key || '').replace(/\s+/g, '');
  }

  function parse(key) {
    var parts = normalise(key).split('.');
    if (parts.length !== 3 || parts[0] !== PREFIX) return null;
    try {
      var payload = JSON.parse(new TextDecoder().decode(fromB64url(parts[1])));
      if (!payload || typeof payload !== 'object') return null;
      return { body: parts[1], sig: fromB64url(parts[2]), payload: payload };
    } catch (e) {
      return null;
    }
  }

  var _key = null;
  function publicKey() {
    if (!PUBLIC_KEY) return Promise.resolve(null);
    if (!_key) {
      _key = crypto.subtle.importKey('jwk', PUBLIC_KEY,
        { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    }
    return _key;
  }

  /* Resolves to the payload for a genuine key, null for anything else. */
  function verify(key) {
    var k = parse(key);
    if (!k) return Promise.resolve(null);
    return publicKey().then(function (pub) {
      if (!pub) return null;
      return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, pub,
        k.sig, new TextEncoder().encode(k.body))
        .then(function (ok) { return ok ? k.payload : null; });
    }).catch(function () { return null; });
  }

  return {
    normalise: normalise,
    verify: verify
  };
})();

if (typeof self !== 'undefined') { self.BEEJ_LICENCE = BEEJ_LICENCE; }
