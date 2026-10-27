/* Applies a verdict to the page: hide a tile, or cover the watch/channel page
   with a block card. Every block is reversible and labelled, so a
   misclassification is something the user can see and undo rather than a video
   that silently never existed. */

var BEEJ_ENFORCE = (function () {
  'use strict';

  var HIDDEN = 'beej-hidden';
  var PENDING = 'beej-pending';
  /* Hidden as a guess, not as a verdict: set by the only-mode watchdog while a
     country lookup is still in flight, and overturned if the answer allows it. */
  var PROVISIONAL = 'beej-provisional';
  var CARD_ID = 'beej-block-card';

  function hide(tile, reason, channelKey) {
    tile.classList.add(HIDDEN);
    tile.classList.remove(PENDING, PROVISIONAL);
    tile.setAttribute('data-beej-reason', reason);
    if (channelKey) tile.setAttribute('data-beej-channel', channelKey);
    syncShelf(tile);
  }

  function show(tile) {
    tile.classList.remove(HIDDEN, PENDING, PROVISIONAL);
    tile.removeAttribute('data-beej-reason');
    tile.removeAttribute('data-beej-channel');
    syncShelf(tile);
  }

  /* A shelf whose tiles are all hidden would leave its heading standing over
     nothing, so it is hidden with them, and shown again the moment any of its
     tiles is. */
  function syncShelf(tile) {
    var shelf = BEEJ_EXTRACT.shelfFor(tile);
    if (!shelf) return;
    var tiles = BEEJ_EXTRACT.tiles(shelf);
    var empty = tiles.length > 0;
    for (var i = 0; i < tiles.length && empty; i++) {
      if (!tiles[i].classList.contains(HIDDEN)) empty = false;
    }
    if (empty) shelf.classList.add(HIDDEN);
    else shelf.classList.remove(HIDDEN);
  }

  /* Reveal only the tiles belonging to one channel, so "Show anyway" on a block
     card does not also unhide every unrelated video in the sidebar. */
  function showChannel(channelKey) {
    if (!channelKey) return;
    var tiles = document.querySelectorAll('[data-beej-channel="' + channelKey.replace(/"/g, '') + '"]');
    for (var i = 0; i < tiles.length; i++) show(tiles[i]);
  }

  function markPending(tile) {
    tile.classList.add(PENDING);
  }

  /* A verdict said "show", and that outranks the watchdog's provisional hide --
     which was only ever a guess made while the country lookup was still in
     flight. Without this a channel whose lookup lost that race stays hidden for
     good, because nothing else ever clears the class. A real block is a verdict
     too, so it is left alone. */
  function release(tile) {
    tile.classList.remove(PENDING);
    if (tile.classList.contains(PROVISIONAL)) {
      tile.classList.remove(PROVISIONAL, HIDDEN);
      syncShelf(tile);
    }
  }

  /* Only-mode's default-deny while a verdict is outstanding: hide it, but mark
     it as a guess so a later verdict can overturn it. */
  function holdHidden(tile) {
    tile.classList.remove(PENDING);
    tile.classList.add(HIDDEN, PROVISIONAL);
    syncShelf(tile);
  }

  /* Undo every effect this extension has had on the document. Used when the
     user turns the extension off or clears their rules, so the page returns to
     normal without a reload. */
  function clearAll() {
    var marked = document.querySelectorAll('.' + HIDDEN + ', .' + PENDING + ', [data-beej]');
    for (var i = 0; i < marked.length; i++) {
      marked[i].classList.remove(HIDDEN, PENDING, PROVISIONAL);
      marked[i].removeAttribute('data-beej');
      marked[i].removeAttribute('data-beej-reason');
      marked[i].removeAttribute('data-beej-channel');
    }
    removeCard();
  }

  /* --- full-page block card -------------------------------------------- */

  /* Every video, not the first: the Shorts player keeps more than one, and a
     watch page visited earlier can leave its player behind in the DOM. Under
     the card nothing should be playing. */
  function pauseVideo() {
    var vs = document.querySelectorAll('video');
    for (var i = 0; i < vs.length; i++) {
      if (!vs[i].paused) { try { vs[i].pause(); } catch (e) { /* ignore */ } }
    }
  }

  function removeCard() {
    var existing = document.getElementById(CARD_ID);
    if (existing) existing.remove();
  }

  /* opts: { title, reason, onAllow, onAllowLabel } */
  function showCard(opts) {
    removeCard();
    pauseVideo();

    var card = document.createElement('div');
    card.id = CARD_ID;
    card.className = 'beej-card';

    var h = document.createElement('h2');
    h.className = 'beej-card__title';
    h.textContent = opts.title || 'Blocked';

    var p = document.createElement('p');
    p.className = 'beej-card__reason';
    p.textContent = opts.reason || '';

    var actions = document.createElement('div');
    actions.className = 'beej-card__actions';

    var back = document.createElement('button');
    back.className = 'beej-card__btn beej-card__btn--primary';
    back.textContent = 'Go back';
    back.addEventListener('click', function () {
      if (history.length > 1) history.back();
      else location.href = 'https://www.youtube.com/';
    });
    actions.appendChild(back);

    if (opts.onAllow) {
      var allow = document.createElement('button');
      allow.className = 'beej-card__btn';
      allow.textContent = opts.onAllowLabel || 'Show anyway';
      allow.addEventListener('click', function () {
        removeCard();
        opts.onAllow();
      });
      actions.appendChild(allow);
    }

    card.appendChild(h);
    card.appendChild(p);
    card.appendChild(actions);
    (document.body || document.documentElement).appendChild(card);

    // The player keeps trying to autoplay behind the card; hold it down until
    // the card goes away.
    var pin = setInterval(function () {
      if (!document.getElementById(CARD_ID)) { clearInterval(pin); return; }
      pauseVideo();
    }, 500);
  }

  return {
    hide: hide,
    show: show,
    showChannel: showChannel,
    markPending: markPending,
    release: release,
    holdHidden: holdHidden,
    clearAll: clearAll,
    showCard: showCard,
    removeCard: removeCard
  };
})();
