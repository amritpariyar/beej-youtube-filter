/* The only file that knows YouTube's DOM.

   When YouTube reshuffles its markup, this file is what breaks and this file
   is what gets fixed. Nothing else should contain a `ytd-` selector. */

var BEEJ_EXTRACT = (function () {
  'use strict';

  /* Tile containers, i.e. the element to actually hide. Ordered roughly by how
     often they appear so the `closest()` walk in tileFor() exits early. */
  var TILE_TAGS = [
    'ytd-rich-item-renderer',        // home, subscriptions, channel grid
    'ytd-video-renderer',            // search results
    'ytd-compact-video-renderer',    // watch-page sidebar
    'ytd-grid-video-renderer',       // older grids
    'ytd-playlist-video-renderer',   // inside a playlist
    'ytd-reel-item-renderer',        // shorts shelf (legacy)
    'ytm-shorts-lockup-view-model',  // shorts shelf (current)
    'yt-lockup-view-model',          // newer generic lockup
    'ytd-rich-grid-media',
    'ytd-compact-radio-renderer'
  ];

  var TILE_SELECTOR = TILE_TAGS.join(',');

  var TITLE_SELECTORS = [
    '#video-title',
    'a#video-title-link',
    'yt-formatted-string#video-title',
    'h3 a#video-title',
    '.yt-lockup-metadata-view-model__title',
    '.shortsLockupViewModelHostMetadataTitle',
    'h3 span[role="text"]',
    'h3'
  ].join(',');

  var CHANNEL_SELECTORS = [
    'ytd-channel-name a',
    '#channel-name a',
    '.yt-content-metadata-view-model__metadata-row a',
    'a.yt-simple-endpoint[href^="/@"]',
    'a[href^="/@"]',
    'a[href^="/channel/"]',
    'a[href*="/@"]'
  ].join(',');

  function text(el) {
    if (!el) return '';
    return (el.getAttribute && el.getAttribute('title')) || el.textContent || '';
  }

  /* Some tiles (notably shorts) carry no channel link at all. Those get a null
     channelKey and are judged on language alone. */
  function channelFrom(tile) {
    var links = tile.querySelectorAll(CHANNEL_SELECTORS);
    for (var i = 0; i < links.length; i++) {
      var href = links[i].getAttribute('href') || '';
      var key = BEEJ.channelKey(href);
      if (key) return { key: key, name: (links[i].textContent || '').trim() };
    }
    return { key: null, name: '' };
  }

  function tiles(root) {
    var scope = root && root.querySelectorAll ? root : document;
    return scope.querySelectorAll(TILE_SELECTOR);
  }

  /* Nearest hideable ancestor of an arbitrary node. */
  function tileFor(node) {
    if (!node || !node.closest) return null;
    return node.closest(TILE_SELECTOR);
  }

  function describe(tile) {
    var titleEl = tile.querySelector(TITLE_SELECTORS);
    var ch = channelFrom(tile);
    return {
      el: tile,
      title: text(titleEl).trim(),
      channelKey: ch.key,
      channelName: ch.name
    };
  }

  /* --- watch page and channel page ------------------------------------- */

  function watchPageChannelKey() {
    var sel = [
      'ytd-video-owner-renderer a[href^="/@"]',
      'ytd-video-owner-renderer a[href^="/channel/"]',
      '#owner #channel-name a',
      '#upload-info a'
    ].join(',');
    var a = document.querySelector(sel);
    return a ? BEEJ.channelKey(a.getAttribute('href')) : null;
  }

  function watchPageTitle() {
    var el = document.querySelector(
      'h1.ytd-watch-metadata yt-formatted-string, h1.ytd-watch-metadata, #title h1'
    );
    return el ? (el.textContent || '').trim() : '';
  }

  /* The channel key implied by the URL itself, for /@handle and /channel/UC... */
  function pageChannelKey() {
    return BEEJ.channelKey(location.pathname);
  }

  function isWatchPage() {
    return location.pathname === '/watch' || location.pathname.indexOf('/shorts/') === 0;
  }

  function isChannelPage() {
    return /^\/(@[^/]+|channel\/UC[0-9A-Za-z_-]{20,})/.test(location.pathname);
  }

  return {
    TILE_SELECTOR: TILE_SELECTOR,
    tiles: tiles,
    tileFor: tileFor,
    describe: describe,
    watchPageChannelKey: watchPageChannelKey,
    watchPageTitle: watchPageTitle,
    pageChannelKey: pageChannelKey,
    isWatchPage: isWatchPage,
    isChannelPage: isChannelPage
  };
})();
