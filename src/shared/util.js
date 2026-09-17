/* Settings, cache access and the country-name -> ISO resolver.
   Classic script: loaded by the content scripts and importScripts'd by the worker. */

var BEEJ = (function () {
  'use strict';

  var DEFAULTS = {
    /* 'block' hides what matches the selections below.
       'only'  hides everything EXCEPT what matches them (immersion mode). */
    mode: 'block',

    enabled: true,
    countries: [],             // ISO 3166-1 alpha-2, read per `mode`
    languages: [],             // ISO 639-1, read per `mode`
    blocklist: [],             // channel keys blocked outright, whatever the rules say
    allowlist: [],             // channel keys that are never hidden, in either mode
    hideTiles: true,
    blockWatch: true,
    blockChannel: true,
    blockUnknownCountry: false, // block mode: hide channels declaring no country
    onlyShowUnknown: false,     // only mode: keep items Beej cannot classify
    langThreshold: 70,          // CLD confidence floor, 0-100
    apiKey: ''                  // optional YouTube Data API v3 key
  };

  /* Pre-mode names for the two selections. Read once, copied forward, removed. */
  var LEGACY = { blockedCountries: null, blockedLanguages: null };

  var CACHE_PREFIX = 'c:';
  var HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;   // a declared country rarely changes
  var MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;   // but re-check the unknowns sooner

  function getSettings() {
    return new Promise(function (resolve) {
      var query = {};
      Object.keys(DEFAULTS).forEach(function (k) { query[k] = DEFAULTS[k]; });
      Object.keys(LEGACY).forEach(function (k) { query[k] = LEGACY[k]; });

      chrome.storage.sync.get(query, function (s) {
        var patch = null;

        function carry(oldKey, newKey) {
          var old = s[oldKey];
          if (old && old.length && !s[newKey].length) {
            s[newKey] = old;
            patch = patch || {};
            patch[newKey] = old;
          }
        }
        carry('blockedCountries', 'countries');
        carry('blockedLanguages', 'languages');

        delete s.blockedCountries;
        delete s.blockedLanguages;

        if (patch) {
          // Write the new names, then drop the old ones. The resulting change
          // event finds nothing left to migrate, so this runs exactly once.
          chrome.storage.sync.set(patch, function () {
            chrome.storage.sync.remove(Object.keys(LEGACY), function () { resolve(s); });
          });
          return;
        }
        resolve(s);
      });
    });
  }

  function setSettings(patch) {
    return new Promise(function (resolve) {
      chrome.storage.sync.set(patch, resolve);
    });
  }

  /* Normalise anything that identifies a channel into one stable cache key.
     Handles are canonical because that is what modern tiles link to; a UC id
     is kept as-is and aliased onto the handle once a lookup resolves both. */
  function channelKey(input) {
    if (!input) return null;
    var s = String(input).trim();
    var m = s.match(/\/channel\/(UC[0-9A-Za-z_-]{20,})/) || s.match(/^(UC[0-9A-Za-z_-]{20,})$/);
    if (m) return m[1];
    m = s.match(/\/(@[^/?#]+)/) || s.match(/^(@[^/?#]+)$/);
    if (m) return m[1].toLowerCase();
    return null;
  }

  /* The About panel gives a localised display name ("United States", "Allemagne"),
     never an ISO code. Build the reverse map in whatever locale the page is using,
     fall back to English, then to the hand-written alias table. */
  var _nameMaps = null;
  function nameMaps() {
    if (_nameMaps) return _nameMaps;
    var locales = [];
    try {
      var nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
      locales = [nav, 'en'];
    } catch (e) {
      locales = ['en'];
    }
    var map = {};
    locales.forEach(function (loc) {
      var dn;
      try { dn = new Intl.DisplayNames([loc], { type: 'region' }); } catch (e) { return; }
      BEEJ_DATA.COUNTRY_CODES.forEach(function (code) {
        var n;
        try { n = dn.of(code); } catch (e) { return; }
        if (n && n !== code) {
          var k = normaliseName(n);
          if (!(k in map)) map[k] = code;
        }
      });
    });
    Object.keys(BEEJ_DATA.COUNTRY_NAME_ALIASES).forEach(function (k) {
      map[normaliseName(k)] = BEEJ_DATA.COUNTRY_NAME_ALIASES[k];
    });
    _nameMaps = map;
    return map;
  }

  function normaliseName(s) {
    return String(s)
      .toLowerCase()
      .replace(/[\u2019'`]/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Accepts either a display name or an already-ISO code. */
  function countryToCode(value) {
    if (!value) return null;
    var s = String(value).trim();
    if (/^[A-Za-z]{2}$/.test(s)) {
      var up = s.toUpperCase();
      if (BEEJ_DATA.COUNTRY_CODES.indexOf(up) !== -1) return up;
    }
    return nameMaps()[normaliseName(s)] || null;
  }

  function countryName(code) {
    try {
      return new Intl.DisplayNames([navigator.language || 'en'], { type: 'region' }).of(code) || code;
    } catch (e) {
      return code;
    }
  }

  function languageName(code) {
    try {
      return new Intl.DisplayNames([navigator.language || 'en'], { type: 'language' }).of(code) || code;
    } catch (e) {
      return code;
    }
  }

  /* The blocklist and the allowlist are mutually exclusive: a channel in both
     is a contradiction, so the most recent choice wins and the other list gives
     it up. Returns the key that was added, or null if it was already there. */
  function addToChannelList(listName, rawKey) {
    var key = channelKey(rawKey);
    if (!key) return Promise.resolve(null);
    var other = listName === 'blocklist' ? 'allowlist' : 'blocklist';

    return getSettings().then(function (s) {
      if (s[listName].indexOf(key) !== -1) return null;
      var patch = {};
      patch[listName] = s[listName].concat([key]);
      patch[other] = s[other].filter(function (k) { return k !== key; });
      return setSettings(patch).then(function () { return key; });
    });
  }

  /* Drop a channel from both manual lists, returning it to whatever the
     country and language rules say about it. */
  function clearChannelLists(rawKey) {
    var key = channelKey(rawKey);
    if (!key) return Promise.resolve(null);
    return getSettings().then(function (s) {
      return setSettings({
        blocklist: s.blocklist.filter(function (k) { return k !== key; }),
        allowlist: s.allowlist.filter(function (k) { return k !== key; })
      }).then(function () { return key; });
    });
  }

  function cacheGet(key) {
    return new Promise(function (resolve) {
      var k = CACHE_PREFIX + key;
      chrome.storage.local.get(k, function (obj) {
        var rec = obj && obj[k];
        if (!rec) return resolve(null);
        var ttl = rec.country ? HIT_TTL_MS : MISS_TTL_MS;
        if (Date.now() - rec.ts > ttl) return resolve(null);
        resolve(rec);
      });
    });
  }

  function cacheSet(key, rec) {
    return new Promise(function (resolve) {
      var obj = {};
      rec.ts = Date.now();
      obj[CACHE_PREFIX + key] = rec;
      chrome.storage.local.set(obj, resolve);
    });
  }

  /* --- About-page scraping ---------------------------------------------

     YouTube renders the channel About panel into ytInitialData on
     /@handle/about, so the country is sitting in the HTML of a plain GET. The
     page is ~2.5 MB though, so stream it and abort the moment the field shows
     up instead of buffering and JSON.parse-ing the lot. */

  var ABOUT_MARKER = '"aboutChannelViewModel":{';
  var COUNTRY_RE = /"country":"([^"]{2,60})"/;
  var MAX_SCAN_AFTER_MARKER = 32768;   // country sits near the top of the object
  var MAX_BYTES = 12 * 1024 * 1024;    // hard stop

  function aboutUrl(key) {
    var path = key.charAt(0) === '@'
      ? '/' + encodeURIComponent(key) + '/about'
      : '/channel/' + encodeURIComponent(key) + '/about';
    // hl=en pins the country to a stable English display name regardless of the
    // viewer's YouTube locale. countryToCode() copes either way, but this keeps
    // the cached value consistent.
    return 'https://www.youtube.com' + path + '?hl=en';
  }

  /* Resolves to { name, bytes, reason }. `name` is a localised display name
     ("United States"), never an ISO code - feed it through countryToCode(). */
  function fetchAboutCountryName(key, init) {
    var url = aboutUrl(key);
    return fetch(url, init || {}).then(function (res) {
      if (!res.ok || !res.body) return { name: null, reason: 'http:' + res.status };

      var reader = res.body.getReader();
      var decoder = new TextDecoder();
      var tail = '';        // overlap so the marker can straddle a chunk boundary
      var window_ = null;   // text from the marker onward, once found
      var bytes = 0;

      function finish(out) {
        try { reader.cancel(); } catch (e) { /* already closed */ }
        out.bytes = bytes;
        return out;
      }

      function pump() {
        return reader.read().then(function (step) {
          if (step.done) {
            return finish({ name: null, reason: window_ === null ? 'no-about-panel' : 'truncated' });
          }
          bytes += step.value.byteLength;
          var chunk = decoder.decode(step.value, { stream: true });

          if (window_ === null) {
            var hay = tail + chunk;
            var i = hay.indexOf(ABOUT_MARKER);
            if (i !== -1) window_ = hay.slice(i);
            else tail = hay.slice(-ABOUT_MARKER.length);
          } else {
            window_ += chunk;
          }

          if (window_ !== null) {
            var m = window_.match(COUNTRY_RE);
            if (m) return finish({ name: m[1] });
            if (window_.length > MAX_SCAN_AFTER_MARKER) {
              return finish({ name: null, reason: 'no-country-field' });
            }
          }
          if (bytes > MAX_BYTES) return finish({ name: null, reason: 'too-large' });

          return pump();
        });
      }

      return pump();
    }).catch(function (e) {
      return { name: null, reason: 'fetch-error:' + e.message };
    });
  }

  return {
    DEFAULTS: DEFAULTS,
    CACHE_PREFIX: CACHE_PREFIX,
    aboutUrl: aboutUrl,
    fetchAboutCountryName: fetchAboutCountryName,
    getSettings: getSettings,
    setSettings: setSettings,
    channelKey: channelKey,
    addToChannelList: addToChannelList,
    clearChannelLists: clearChannelLists,
    countryToCode: countryToCode,
    countryName: countryName,
    languageName: languageName,
    cacheGet: cacheGet,
    cacheSet: cacheSet
  };
})();

if (typeof self !== 'undefined') { self.BEEJ = BEEJ; }
