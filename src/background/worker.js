/* Service worker: owns the country cache, de-duplicates concurrent lookups, and
   performs the actual resolution.

   Resolution order for a channel key:
     1. chrome.storage.local cache (30d for a hit, 7d for a miss)
     2. YouTube's own About page, streamed and parsed (see BEEJ.fetchAboutCountryName)
     3. the same request re-issued from inside the YouTube tab, if the worker's
        cookie-less request hit a consent wall
     4. YouTube Data API v3, only if the user supplied a key

   Step 2 carries the load: no API key, no quota, no OAuth. */

importScripts('/src/shared/data.js', '/src/shared/util.js');

var inFlight = new Map();

/* Rolling record of what was actually hidden, newest first. Capped so it stays
   a diagnostic rather than a browsing history. */
var LOG_KEY = 'blocklog';
var LOG_MAX = 400;
var TALLY_KEY = 'langtally';
var HIDDEN_KEY = 'hiddencount';

function logId(e) {
  return (e.key || '?') + '|' + (e.title || '');
}

/* --------------------------------------------------------- data api v3 */

function fetchCountryViaApi(key, apiKey) {
  var params = key.charAt(0) === '@'
    ? 'forHandle=' + encodeURIComponent(key)
    : 'id=' + encodeURIComponent(key);
  var url = 'https://youtube.googleapis.com/youtube/v3/channels'
    + '?part=snippet,brandingSettings&' + params + '&key=' + encodeURIComponent(apiKey);

  return fetch(url).then(function (res) {
    return res.json().catch(function () { return null; }).then(function (body) {
      if (!res.ok || !body) {
        var msg = body && body.error && body.error.message;
        return { code: null, reason: 'api:' + res.status + (msg ? ' ' + msg : '') };
      }
      var item = body.items && body.items[0];
      if (!item) return { code: null, reason: 'api:not-found' };

      // snippet.country is the read projection of brandingSettings.channel.country;
      // whichever is populated, both are already ISO 3166-1 alpha-2.
      var raw = (item.snippet && item.snippet.country)
        || (item.brandingSettings && item.brandingSettings.channel && item.brandingSettings.channel.country)
        || null;
      return { code: raw ? String(raw).toUpperCase() : null, reason: raw ? null : 'api:no-country' };
    });
  }).catch(function (e) {
    return { code: null, reason: 'api-error:' + e.message };
  });
}

/* ------------------------------------------------------------- resolver */

function askTab(tabId, key) {
  return new Promise(function (done) {
    if (tabId == null) return done(null);
    try {
      chrome.tabs.sendMessage(tabId, { type: 'beej:fetchAbout', key: key }, function (res) {
        if (chrome.runtime.lastError || !res) return done(null);
        done(res.name || null);
      });
    } catch (e) {
      done(null);
    }
  });
}

function resolve(key, senderTabId) {
  return BEEJ.cacheGet(key).then(function (cached) {
    if (cached) return { hit: true, code: cached.country };

    return BEEJ.getSettings().then(function (settings) {
      return BEEJ.fetchAboutCountryName(key, { credentials: 'include' })
        .then(function (viaWorker) {
          if (viaWorker.name) return { code: BEEJ.countryToCode(viaWorker.name), source: 'about' };
          // The worker fetches from the extension origin, so a consent wall or a
          // regional interstitial can swallow the panel. Retry from inside the
          // tab, where the request is same-origin and carries the real session.
          return askTab(senderTabId, key).then(function (name) {
            if (name) return { code: BEEJ.countryToCode(name), source: 'about:tab' };
            return { code: null, source: 'miss' };
          });
        })
        .then(function (r) {
          if (r.code || !settings.apiKey) return r;
          return fetchCountryViaApi(key, settings.apiKey).then(function (viaApi) {
            return viaApi.code ? { code: viaApi.code, source: 'api' } : r;
          });
        })
        .then(function (r) {
          return BEEJ.cacheSet(key, { country: r.code, source: r.source })
            .then(function () { return { hit: false, code: r.code }; });
        });
    });
  });
}

function resolveOnce(key, senderTabId) {
  if (inFlight.has(key)) return inFlight.get(key);
  var p = resolve(key, senderTabId)
    .catch(function () { return { code: null }; })
    .then(function (r) {
      inFlight.delete(key);
      return r.code;
    });
  inFlight.set(key, p);
  return p;
}

/* -------------------------------------------------------------- routing */

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  if (!msg || !msg.type) return;

  if (msg.type === 'beej:country') {
    var key = BEEJ.channelKey(msg.key);
    if (!key) { sendResponse({ country: null }); return; }
    resolveOnce(key, sender.tab && sender.tab.id).then(function (code) {
      sendResponse({ country: code });
    });
    return true;
  }

  if (msg.type === 'beej:testApiKey') {
    fetchCountryViaApi('@youtube', msg.apiKey).then(function (r) {
      var ok = !r.reason || r.reason === 'api:no-country';
      sendResponse({ ok: ok, detail: r.reason || 'ok' });
    });
    return true;
  }

  if (msg.type === 'beej:cacheStats') {
    chrome.storage.local.get(null, function (all) {
      var keys = Object.keys(all).filter(function (k) { return k.indexOf(BEEJ.CACHE_PREFIX) === 0; });
      var resolved = keys.filter(function (k) { return all[k] && all[k].country; });
      sendResponse({ total: keys.length, resolved: resolved.length });
    });
    return true;
  }

  /* Everything the cache knows, for the channel table in options. Language
     verdicts are deliberately absent: language is judged per video title, not
     per channel, so there is nothing channel-shaped to report. */
  if (msg.type === 'beej:channelList') {
    chrome.storage.local.get(null, function (all) {
      var channels = [];
      Object.keys(all).forEach(function (k) {
        if (k.indexOf(BEEJ.CACHE_PREFIX) !== 0) return;
        var rec = all[k] || {};
        channels.push({
          key: k.slice(BEEJ.CACHE_PREFIX.length),
          country: rec.country || null,
          source: rec.source || null,
          ts: rec.ts || 0
        });
      });
      sendResponse({ channels: channels });
    });
    return true;
  }

  /* --- block log ------------------------------------------------------ */

  if (msg.type === 'beej:logBlocks') {
    chrome.storage.local.get(LOG_KEY, function (o) {
      var log = (o && o[LOG_KEY]) || [];
      var seen = {};
      log.forEach(function (e) { seen[logId(e)] = true; });

      (msg.entries || []).forEach(function (e) {
        var id = logId(e);
        if (seen[id]) return;   // same video hidden again on a later scroll
        seen[id] = true;
        log.push(e);
      });

      log.sort(function (a, b) { return b.ts - a.ts; });
      if (log.length > LOG_MAX) log = log.slice(0, LOG_MAX);
      var patch = {};
      patch[LOG_KEY] = log;
      // Respond once the write lands: an open port keeps the worker alive, so
      // a fire-and-forget write could otherwise race the worker going idle.
      chrome.storage.local.set(patch, function () { sendResponse({ ok: true }); });
    });
    return true;
  }

  /* Running tally of language verdicts seen, blocked or not. */
  if (msg.type === 'beej:logLangs') {
    chrome.storage.local.get(TALLY_KEY, function (o) {
      var tally = (o && o[TALLY_KEY]) || {};
      Object.keys(msg.counts || {}).forEach(function (k) {
        tally[k] = (tally[k] || 0) + msg.counts[k];
      });
      var patch = {};
      patch[TALLY_KEY] = tally;
      chrome.storage.local.set(patch, function () { sendResponse({ ok: true }); });
    });
    return true;
  }

  /* Only-mode hides too much of a feed to log per video, so it keeps a count. */
  if (msg.type === 'beej:countHidden') {
    chrome.storage.local.get(HIDDEN_KEY, function (o) {
      var patch = {};
      patch[HIDDEN_KEY] = ((o && o[HIDDEN_KEY]) || 0) + (msg.n || 0);
      chrome.storage.local.set(patch, function () { sendResponse({ ok: true }); });
    });
    return true;
  }

  if (msg.type === 'beej:hiddenCount') {
    chrome.storage.local.get(HIDDEN_KEY, function (o) {
      sendResponse({ n: (o && o[HIDDEN_KEY]) || 0 });
    });
    return true;
  }

  if (msg.type === 'beej:langTally') {
    chrome.storage.local.get(TALLY_KEY, function (o) {
      sendResponse({ tally: (o && o[TALLY_KEY]) || {} });
    });
    return true;
  }

  if (msg.type === 'beej:blockLog') {
    chrome.storage.local.get(LOG_KEY, function (o) {
      sendResponse({ entries: (o && o[LOG_KEY]) || [] });
    });
    return true;
  }

  if (msg.type === 'beej:clearBlockLog') {
    chrome.storage.local.remove(LOG_KEY, function () { sendResponse({ ok: true }); });
    return true;
  }

  /* "What Beej has seen" is the channel cache and the language tally together,
     so one button clears both. The block log is separate and survives. */
  if (msg.type === 'beej:clearCache') {
    chrome.storage.local.get(null, function (all) {
      var keys = Object.keys(all).filter(function (k) { return k.indexOf(BEEJ.CACHE_PREFIX) === 0; });
      chrome.storage.local.remove(keys.concat([TALLY_KEY, HIDDEN_KEY]), function () {
        sendResponse({ cleared: keys.length });
      });
    });
    return true;
  }
});

/* -------------------------------------------------------- context menus

   Typing handles into a textarea is not a workflow anyone uses, so blocking a
   channel has to be reachable from the page itself:
     - right-click a channel name anywhere (feed, sidebar, comments)
     - right-click the page while watching a video or on a channel page */

var MENU_LINK = 'beej-block-link';
var MENU_PAGE = 'beej-block-page';

function createMenus() {
  chrome.contextMenus.removeAll(function () {
    chrome.contextMenus.create({
      id: MENU_LINK,
      title: 'Block this YouTube channel',
      contexts: ['link'],
      targetUrlPatterns: [
        '*://www.youtube.com/@*',
        '*://www.youtube.com/channel/*'
      ]
    });
    chrome.contextMenus.create({
      id: MENU_PAGE,
      title: 'Block the channel on this page',
      contexts: ['page'],
      documentUrlPatterns: [
        '*://www.youtube.com/watch*',
        '*://www.youtube.com/shorts/*',
        '*://www.youtube.com/@*',
        '*://www.youtube.com/channel/*'
      ]
    });
  });
}

function blockChannel(rawKey) {
  return BEEJ.addToChannelList('blocklist', rawKey).then(function (key) {
    // Content scripts pick the change up via storage.onChanged and re-scan, so
    // open tabs update without a reload.
    return key;
  });
}

chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === MENU_LINK) {
    blockChannel(info.linkUrl);
    return;
  }
  if (info.menuItemId === MENU_PAGE && tab && tab.id != null) {
    chrome.tabs.sendMessage(tab.id, { type: 'beej:currentChannel' }, function (res) {
      if (chrome.runtime.lastError || !res || !res.key) return;
      blockChannel(res.key);
    });
  }
});

/* ------------------------------------------------- inject into open tabs

   Manifest content scripts only run on navigations that happen after the
   extension loads, so YouTube tabs that were already open would sit unfiltered
   until reloaded. Inject into them directly instead. The file list is read back
   off the manifest so it cannot drift out of sync, and observer.js carries a
   guard that makes a redundant injection a no-op. */

function injectIntoOpenTabs() {
  var cs = (chrome.runtime.getManifest().content_scripts || [])[0];
  if (!cs || !chrome.scripting) return;

  chrome.tabs.query({ url: 'https://www.youtube.com/*' }, function (tabs) {
    if (chrome.runtime.lastError || !tabs) return;
    tabs.forEach(function (tab) {
      if (tab.id == null) return;
      var target = { tabId: tab.id };
      // A tab can be discarded, mid-navigation or otherwise un-injectable;
      // swallow those rather than letting them surface as worker errors.
      if (cs.css) {
        chrome.scripting.insertCSS({ target: target, files: cs.css }, swallow);
      }
      if (cs.js) {
        chrome.scripting.executeScript({ target: target, files: cs.js }, swallow);
      }
    });
  });
}

function swallow() {
  if (chrome.runtime.lastError) { /* tab not injectable; nothing to do */ }
}

chrome.runtime.onStartup.addListener(createMenus);

/* Fires on first install, on every extension update, and each time the
   extension is reloaded from chrome://extensions. */
chrome.runtime.onInstalled.addListener(function (details) {
  createMenus();
  injectIntoOpenTabs();
  if (details.reason === 'install') chrome.runtime.openOptionsPage();
});

chrome.action.onClicked.addListener(function () {
  chrome.runtime.openOptionsPage();
});
