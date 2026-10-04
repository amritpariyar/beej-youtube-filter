/* Parental lock: a PIN that gates the options page, plus a one-time recovery
   code for when the PIN is forgotten.

   Neither secret is stored. Each is run through PBKDF2 with its own random
   salt and only the derived hash is kept, in chrome.storage.sync next to the
   rules it protects. A short PIN can still be brute-forced by anyone who can
   read that storage, so the hashing keeps the PIN from being read off in plain
   text; it is not what makes the lock hold. The failure back-off below does
   that job against someone guessing at the form.

   Classic script: loaded by the options page. */

var BEEJ_LOCK = (function () {
  'use strict';

  var ITERATIONS = 150000;
  var MIN_PIN = 4;

  /* No 0/O, 1/I/L: the recovery code gets written on paper and typed back. */
  var RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  var FAILS_KEY = 'lockfails';
  var FREE_TRIES = 5;
  var BASE_WAIT_MS = 30 * 1000;
  var MAX_WAIT_MS = 15 * 60 * 1000;

  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }

  function fromB64(s) {
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function derive(secret, salt, iterations) {
    return crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
      'PBKDF2', false, ['deriveBits'])
      .then(function (base) {
        return crypto.subtle.deriveBits(
          { name: 'PBKDF2', hash: 'SHA-256', salt: salt, iterations: iterations },
          base, 256);
      })
      .then(function (bits) { return toB64(new Uint8Array(bits)); });
  }

  function seal(secret) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    return derive(secret, salt, ITERATIONS).then(function (hash) {
      return { salt: toB64(salt), hash: hash, iter: ITERATIONS };
    });
  }

  function matches(rec, secret) {
    if (!rec || !rec.salt || !rec.hash) return Promise.resolve(false);
    return derive(secret, fromB64(rec.salt), rec.iter || ITERATIONS)
      .then(function (hash) {
        if (hash.length !== rec.hash.length) return false;
        var diff = 0;
        for (var i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ rec.hash.charCodeAt(i);
        return diff === 0;
      });
  }

  function normalisePin(pin) {
    return String(pin || '').trim();
  }

  function pinProblem(pin) {
    pin = normalisePin(pin);
    if (pin.length < MIN_PIN) return 'Use at least ' + MIN_PIN + ' characters.';
    return null;
  }

  function newRecoveryCode() {
    var bytes = crypto.getRandomValues(new Uint8Array(12));
    var out = '';
    for (var i = 0; i < bytes.length; i++) {
      if (i && i % 4 === 0) out += '-';
      out += RECOVERY_ALPHABET[bytes[i] % RECOVERY_ALPHABET.length];
    }
    return out;
  }

  /* Case, dashes and spacing are not part of the code. */
  function normaliseRecovery(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  /* Resolves to { lock, recoveryCode }. `lock` is what goes into settings; the
     recovery code is shown once and never stored. */
  function create(pin) {
    var code = newRecoveryCode();
    return Promise.all([seal(normalisePin(pin)), seal(normaliseRecovery(code))])
      .then(function (r) {
        return { lock: { v: 1, pin: r[0], recovery: r[1] }, recoveryCode: code };
      });
  }

  /* A new PIN keeps the existing recovery code. */
  function changePin(lock, pin) {
    return seal(normalisePin(pin)).then(function (rec) {
      return { v: 1, pin: rec, recovery: lock.recovery };
    });
  }

  function checkPin(lock, pin) {
    return matches(lock && lock.pin, normalisePin(pin));
  }

  function checkRecovery(lock, code) {
    return matches(lock && lock.recovery, normaliseRecovery(code));
  }

  /* --- failure back-off ----------------------------------------------

     Kept in storage.local rather than in memory, so reloading the page does
     not hand out a fresh set of guesses. */

  function readFails() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(FAILS_KEY, function (o) {
        resolve((o && o[FAILS_KEY]) || { n: 0, until: 0 });
      });
    });
  }

  function waitFor(n) {
    if (n < FREE_TRIES) return 0;
    return Math.min(MAX_WAIT_MS, BASE_WAIT_MS * Math.pow(2, n - FREE_TRIES));
  }

  /* Milliseconds until another attempt is allowed; 0 means now. */
  function retryIn() {
    return readFails().then(function (f) { return Math.max(0, f.until - Date.now()); });
  }

  function recordFailure() {
    return readFails().then(function (f) {
      var n = f.n + 1;
      var patch = {};
      patch[FAILS_KEY] = { n: n, until: Date.now() + waitFor(n) };
      return new Promise(function (resolve) {
        chrome.storage.local.set(patch, function () { resolve(waitFor(n)); });
      });
    });
  }

  function clearFailures() {
    return new Promise(function (resolve) {
      chrome.storage.local.remove(FAILS_KEY, resolve);
    });
  }

  return {
    MIN_PIN: MIN_PIN,
    pinProblem: pinProblem,
    create: create,
    changePin: changePin,
    checkPin: checkPin,
    checkRecovery: checkRecovery,
    retryIn: retryIn,
    recordFailure: recordFailure,
    clearFailures: clearFailures,
    _waitFor: waitFor
  };
})();

if (typeof self !== 'undefined') { self.BEEJ_LOCK = BEEJ_LOCK; }
