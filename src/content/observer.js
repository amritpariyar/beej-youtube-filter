/* Orchestrator: finds tiles, judges them, applies the verdict, and keeps doing
   that as YouTube swaps the page out from under us.

   YouTube is a single-page app, so this has to survive three different kinds of
   change: lazily appended tiles (MutationObserver), soft navigation between
   pages (yt-navigate-finish), and the user editing their rules (storage
   onChanged). All three funnel into the same scan(). */

(function () {
  'use strict';

  /* The worker re-injects these scripts into YouTube tabs that were already
     open when the extension loaded. Content scripts from one extension share an
     isolated-world global, so this guard makes a second injection a no-op
     instead of a second set of observers. */
  if (window.__beejLoaded) return;
  window.__beejLoaded = true;

  var PROCESSED = 'data-beej';
  var DEBOUNCE_MS = 120;
  /* Watchdog: never leave a tile invisible longer than this. It has to clear a
     cold country lookup (~600-800ms against YouTube's About page) or only-mode
     hides allowed channels on first sight of them. */
  var PENDING_MS = 1500;

  var settings = null;
  var pendingTimer = null;
  var scanTimer = null;

  /* Channels the user has chosen to see this session via "Show anyway".
     Deliberately not persisted -- the allowlist in options is the durable one. */
  var sessionAllow = new Set();

  /* ---------------------------------------------------------------- lookup */

  var countryCache = new Map();   // channelKey -> code | null, per page session
  var inFlight = new Map();

  function lookupCountry(key) {
    if (countryCache.has(key)) return Promise.resolve(countryCache.get(key));
    if (inFlight.has(key)) return inFlight.get(key);

    var p = new Promise(function (resolve) {
      chrome.runtime.sendMessage({ type: 'beej:country', key: key }, function (res) {
        if (chrome.runtime.lastError || !res) return resolve(null);
        resolve(res.country || null);
      });
    }).then(function (code) {
      countryCache.set(key, code);
      inFlight.delete(key);
      return code;
    });

    inFlight.set(key, p);
    return p;
  }

  /* ---------------------------------------------------------------- verdict */

  function allowed(key) {
    if (!key) return false;
    if (sessionAllow.has(key)) return true;
    return settings.allowlist.indexOf(key) !== -1;
  }

  /* An explicit per-channel block. Checked before language and country because
     it is free and because the user asking for it by name outranks inference. */
  function blockedChannel(key) {
    return !!key && settings.blocklist.indexOf(key) !== -1;
  }

  function onlyMode() {
    return settings.mode === 'only';
  }

  /* In only-mode an empty selection would hide the entire feed, which is never
     what someone means. With nothing chosen, nothing is filtered. */
  function onlyRulesActive() {
    return settings.countries.length > 0 || settings.languages.length > 0;
  }

  function countryRuleActive() {
    if (onlyMode()) return settings.countries.length > 0;
    return settings.countries.length > 0 || settings.blockUnknownCountry;
  }

  function languageRuleActive() {
    return settings.languages.length > 0;
  }

  /* Both modes read the same two lists; only the sense of the test changes.
     Each returns { hide: bool, label, kind, detail }. */

  function countryVerdict(code) {
    var known = code !== null && code !== undefined;

    if (onlyMode()) {
      if (!known) {
        return settings.onlyShowUnknown
          ? { hide: false }
          : { hide: true, label: 'no country declared', kind: 'country', detail: '' };
      }
      if (settings.countries.indexOf(code) !== -1) return { hide: false };
      return {
        hide: true, kind: 'country', detail: code,
        label: 'not an allowed country (' + BEEJ.countryName(code) + ')'
      };
    }

    if (!known) {
      return settings.blockUnknownCountry
        ? { hide: true, label: 'country not declared', kind: 'country', detail: '' }
        : { hide: false };
    }
    if (settings.countries.indexOf(code) !== -1) {
      return {
        hide: true, kind: 'country', detail: code,
        label: 'country: ' + BEEJ.countryName(code)
      };
    }
    return { hide: false };
  }

  function languageVerdict(verdict) {
    if (onlyMode()) {
      if (!verdict) {
        return settings.onlyShowUnknown
          ? { hide: false }
          : { hide: true, label: 'language not identified', kind: 'language', detail: '' };
      }
      var hit = verdict.langs.some(function (c) {
        return settings.languages.indexOf(c) !== -1;
      });
      if (hit) return { hide: false };
      return {
        hide: true, kind: 'language', detail: verdict.langs[0],
        label: 'not an allowed language (' + BEEJ.languageName(verdict.langs[0]) + ')'
      };
    }

    var bad = BEEJ_LANG.isBlocked(verdict, settings.languages);
    if (!bad) return { hide: false };
    return {
      hide: true, kind: 'language', detail: bad,
      label: 'language: ' + BEEJ.languageName(bad)
    };
  }

  /* ------------------------------------------------------------- block log

     What actually got hidden, so the options page can show it. Buffered and
     flushed in batches, because a single feed scroll can hide dozens of tiles
     and one storage write per tile would be absurd. */

  /* Languages seen, blocked or not, so options can show what is actually in
     this feed rather than only what the rules already caught. Keyed by the
     whole verdict set, because an unnarrowed Devanagari verdict genuinely is
     "Hindi or Marathi or Nepali" and pretending otherwise mislabels it. */
  var langTally = {};
  var tallyTimer = null;

  function tallyLang(verdict) {
    if (!verdict || !verdict.langs.length) return;
    var key = verdict.langs.join(',');
    langTally[key] = (langTally[key] || 0) + 1;
    if (tallyTimer) return;
    tallyTimer = setTimeout(function () {
      tallyTimer = null;
      var batch = langTally;
      langTally = {};
      if (!Object.keys(batch).length) return;
      try {
        chrome.runtime.sendMessage({ type: 'beej:logLangs', counts: batch }, function () {
          if (chrome.runtime.lastError) { /* worker asleep; drop the batch */ }
        });
      } catch (e) { /* extension context torn down */ }
    }, 2000);
  }

  /* Only-mode hides most of a feed, so it gets a running count rather than a
     per-video log. */
  var hiddenCount = 0;
  var hiddenTimer = null;

  function countHidden() {
    hiddenCount++;
    if (hiddenTimer) return;
    hiddenTimer = setTimeout(function () {
      hiddenTimer = null;
      var n = hiddenCount;
      hiddenCount = 0;
      if (!n) return;
      try {
        chrome.runtime.sendMessage({ type: 'beej:countHidden', n: n }, function () {
          if (chrome.runtime.lastError) { /* worker asleep; drop it */ }
        });
      } catch (e) { /* extension context torn down */ }
    }, 2000);
  }

  var logBuffer = [];
  var logTimer = null;

  function logBlock(info, kind, detail) {
    logBuffer.push({
      key: info.channelKey || null,
      name: info.channelName || '',
      title: info.title || '',
      kind: kind,          // 'language' | 'country' | 'manual'
      detail: detail || '', // 'hi' | 'IN' | ''
      ts: Date.now()
    });
    if (logTimer) return;
    logTimer = setTimeout(function () {
      logTimer = null;
      var batch = logBuffer;
      logBuffer = [];
      if (!batch.length) return;
      try {
        chrome.runtime.sendMessage({ type: 'beej:logBlocks', entries: batch }, function () {
          if (chrome.runtime.lastError) { /* worker asleep; drop the batch */ }
        });
      } catch (e) { /* extension context torn down */ }
    }, 1500);
  }

  function judgeTile(info) {
    if (allowed(info.channelKey)) {
      BEEJ_ENFORCE.show(info.el);
      return;
    }

    if (blockedChannel(info.channelKey)) {
      BEEJ_ENFORCE.hide(info.el, 'blocked channel', info.channelKey);
      logBlock(info, 'manual', '');
      return;
    }

    // Only-mode with nothing selected would blank the feed. Show everything.
    if (onlyMode() && !onlyRulesActive()) {
      BEEJ_ENFORCE.release(info.el);
      return;
    }

    var text = info.title + ' ' + info.channelName;

    BEEJ_LANG.detect(text, settings.langThreshold).then(function (verdict) {
      tallyLang(verdict);

      if (languageRuleActive()) {
        var lv = languageVerdict(verdict);
        if (lv.hide) return drop(info, lv);
      }

      // In block mode a tile that survives the language test is already safe to
      // show. In only-mode it must still clear the country test, so it stays
      // held until that lands rather than flashing content it will then hide.
      if (!countryRuleActive() || !info.channelKey) {
        if (onlyMode() && countryRuleActive() && !info.channelKey) {
          // Nothing to resolve (shorts, sidebar lockups): cannot prove it is
          // allowed, so it is only kept if unknowns are kept.
          if (!settings.onlyShowUnknown) {
            return drop(info, {
              hide: true, kind: 'country', detail: '',
              label: 'channel unknown, cannot confirm country'
            });
          }
        }
        BEEJ_ENFORCE.release(info.el);
        return;
      }

      if (!onlyMode()) BEEJ_ENFORCE.release(info.el);

      lookupCountry(info.channelKey).then(function (code) {
        // The tile may have been recycled by YouTube while we waited.
        if (!info.el.isConnected) return;
        var cv = countryVerdict(code);
        if (cv.hide) return drop(info, cv);
        BEEJ_ENFORCE.release(info.el);
      });
    });
  }

  /* Hide a tile and record why. Only-mode hides most of the feed by design, so
     per-tile logging there would be noise that evicts everything useful from a
     400-entry log; the counter in options covers it instead. */
  function drop(info, v) {
    BEEJ_ENFORCE.hide(info.el, v.label, info.channelKey);
    if (onlyMode()) countHidden();
    else logBlock(info, v.kind, v.detail);
  }

  /* ------------------------------------------------------------------ scan */

  function scan(root) {
    if (!settings || !settings.enabled) return;

    if (settings.hideTiles) {
      var list = BEEJ_EXTRACT.tiles(root);
      for (var i = 0; i < list.length; i++) {
        var tile = list[i];
        if (tile.hasAttribute(PROCESSED)) continue;
        tile.setAttribute(PROCESSED, '1');

        var info = BEEJ_EXTRACT.describe(tile);
        if (!info.title && !info.channelKey) {
          // Skeleton placeholder, nothing to judge yet; let a later mutation
          // pick it up once YouTube fills it in.
          tile.removeAttribute(PROCESSED);
          continue;
        }
        BEEJ_ENFORCE.markPending(tile);
        judgeTile(info);
      }
      armPendingWatchdog();
    }

    checkFullPage();
  }

  function scheduleScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(function () {
      scanTimer = null;
      var run = function () { scan(document); };
      if (window.requestIdleCallback) requestIdleCallback(run, { timeout: 500 });
      else run();
    }, DEBOUNCE_MS);
  }

  /* A tile whose verdict never arrives must not stay half-applied forever. The
     safe fallback differs by mode: block mode shows it (a missed block beats a
     hole in the feed), only-mode keeps it hidden (default-deny is the whole
     point of "show me only X"). */
  function armPendingWatchdog() {
    if (pendingTimer) return;
    pendingTimer = setTimeout(function () {
      pendingTimer = null;
      var stuck = document.querySelectorAll('.beej-pending');
      var denyByDefault = onlyMode() && onlyRulesActive();
      for (var i = 0; i < stuck.length; i++) {
        if (denyByDefault) BEEJ_ENFORCE.holdHidden(stuck[i]);
        else BEEJ_ENFORCE.release(stuck[i]);
      }
    }, PENDING_MS);
  }

  /* ------------------------------------------------- watch / channel pages */

  var lastFullPageKey = null;

  function checkFullPage() {
    var isWatch = BEEJ_EXTRACT.isWatchPage();
    var isChannel = BEEJ_EXTRACT.isChannelPage();

    if (!(isWatch && settings.blockWatch) && !(isChannel && settings.blockChannel)) {
      BEEJ_ENFORCE.removeCard();
      lastFullPageKey = null;
      return;
    }

    if (!isWatch) {
      judgeFullPage(BEEJ_EXTRACT.pageChannelKey(), '', false);
      return;
    }

    var href = location.href;
    pageVideo().then(function (v) {
      if (location.href !== href) return;   // navigated on while resolving
      judgeFullPage(v && v.key, (v && v.title) || '', true);
    });
  }

  /* Channel and title of the video on a watch or Shorts page. oEmbed comes
     first because it goes by the id in the URL, where the DOM can still hold
     the previous video's owner, and it covers Shorts and collaborations. The
     DOM is the fallback for videos oEmbed refuses, on /watch only: a Shorts
     page has no watch-page markup of its own, just a possibly stale one. */
  var videoOwners = new Map();    // videoId -> Promise<{ key, title } | null>

  function pageVideo() {
    var id = BEEJ_EXTRACT.currentVideoId();
    if (!id) return Promise.resolve(null);
    if (!videoOwners.has(id)) videoOwners.set(id, BEEJ.fetchVideoOwner(id));
    return videoOwners.get(id).then(function (v) {
      if (v || BEEJ_EXTRACT.isShortsPage()) return v;
      var key = BEEJ_EXTRACT.watchPageChannelKey();
      return key ? { key: key, title: BEEJ_EXTRACT.watchPageTitle() } : null;
    });
  }

  function judgeFullPage(key, title, isWatch) {
    if (!key || allowed(key)) {
      BEEJ_ENFORCE.removeCard();
      return;
    }

    var stamp = fullPageStamp(key);
    if (stamp === lastFullPageKey) return;
    lastFullPageKey = stamp;

    var info = { channelKey: key, channelName: '', title: title };

    if (blockedChannel(key)) {
      blockFullPage(key, 'blocked channel', isWatch, info, 'manual', '');
      return;
    }

    if (onlyMode() && !onlyRulesActive()) return;

    BEEJ_LANG.detect(title, settings.langThreshold).then(function (verdict) {
      tallyLang(verdict);

      if (languageRuleActive()) {
        var lv = languageVerdict(verdict);
        if (lv.hide) return blockFullPage(key, lv.label, isWatch, info, lv.kind, lv.detail);
      }

      if (!countryRuleActive()) return;
      return lookupCountry(key).then(function (code) {
        var cv = countryVerdict(code);
        if (cv.hide) blockFullPage(key, cv.label, isWatch, info, cv.kind, cv.detail);
      });
    });
  }

  function blockFullPage(key, reason, isWatch, info, kind, detail) {
    if (stampChanged(key)) return;
    // A full-page block is a block like any other, and belongs in the record.
    if (info) logBlock(info, kind, detail);
    // Under the parental lock the card is final: no "Watch anyway". Changing
    // what gets through means unlocking the options page.
    var locked = !!settings.lock;
    BEEJ_ENFORCE.showCard({
      title: isWatch ? 'This video is filtered' : 'This channel is filtered',
      reason: 'Beej hid this because of your filter rules (' + reason + ').'
        + (locked ? ' Settings are locked.' : ''),
      onAllowLabel: isWatch ? 'Watch anyway' : 'Show anyway',
      onAllow: locked ? null : function () {
        sessionAllow.add(key);
        lastFullPageKey = null;
        BEEJ_ENFORCE.showChannel(key);
      }
    });
  }

  /* Every /watch page shares a pathname, so the query (the video id) is part
     of what makes a page the same page. */
  function fullPageStamp(key) {
    return location.pathname + location.search + '|' + key;
  }

  function stampChanged(key) {
    return lastFullPageKey !== fullPageStamp(key);
  }

  /* ------------------------------------------------------------------ boot */

  function reset() {
    countryCache.clear();
    lastFullPageKey = null;
    BEEJ_ENFORCE.clearAll();
    var marked = document.querySelectorAll('[' + PROCESSED + ']');
    for (var i = 0; i < marked.length; i++) marked[i].removeAttribute(PROCESSED);
  }

  function start() {
    var observer = new MutationObserver(scheduleScan);
    observer.observe(document.documentElement, { childList: true, subtree: true });

    document.addEventListener('yt-navigate-finish', function () {
      lastFullPageKey = null;
      BEEJ_ENFORCE.removeCard();
      scheduleScan();
    }, true);

    window.addEventListener('yt-page-data-updated', scheduleScan, true);
    window.addEventListener('popstate', scheduleScan);

    /* The worker asks us to re-issue an About fetch when its own cookie-less
       request came back without the panel (consent walls, regional
       interstitials). From here the request is same-origin. */
    chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
      if (!msg) return;

      if (msg.type === 'beej:fetchAbout') {
        BEEJ.fetchAboutCountryName(msg.key, { credentials: 'include' })
          .then(function (r) { sendResponse({ name: r.name || null }); });
        return true;
      }

      // Which channel does the current page belong to? Backs the "Block the
      // channel on this page" context-menu item.
      if (msg.type === 'beej:currentChannel') {
        if (!BEEJ_EXTRACT.isWatchPage()) {
          sendResponse({ key: BEEJ_EXTRACT.pageChannelKey() });
          return;
        }
        pageVideo().then(function (v) { sendResponse({ key: v ? v.key : null }); });
        return true;
      }
    });

    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      BEEJ.getSettings().then(function (s) {
        settings = s;
        // "Show anyway" choices made before the lock went on do not survive it.
        if (s.lock) sessionAllow.clear();
        reset();
        if (s.enabled) scan(document);
      });
    });

    scheduleScan();
  }

  BEEJ.getSettings().then(function (s) {
    settings = s;
    if (document.documentElement) start();
    else document.addEventListener('DOMContentLoaded', start, { once: true });
  });
})();
