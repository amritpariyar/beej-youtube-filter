/* Options page. Every control writes straight through to chrome.storage.sync;
   the content script listens for the change and re-scans, so edits land on an
   open YouTube tab without a reload. */

(function () {
  'use strict';

  var state = null;

  var TOGGLES = ['enabled', 'hideTiles', 'blockWatch', 'blockChannel',
               'blockUnknownCountry', 'onlyShowUnknown'];

  function $(id) { return document.getElementById(id); }

  function save(patch) {
    Object.assign(state, patch);
    BEEJ.setSettings(patch).then(flashSaved);
  }

  var savedTimer = null;
  function flashSaved() {
    var el = $('saved');
    el.hidden = false;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(function () { el.hidden = true; }, 1200);
  }

  /* Anything that draws from settings registers a redraw here, so a change made
     in one place (a breakdown chip, the context menu, a row button) refreshes
     every other view. */
  var redraws = [];

  function redrawAll() {
    redraws.forEach(function (fn) { fn(); });
  }

  function onlyMode() { return state.mode === 'only'; }

  /* The same two lists mean opposite things in the two modes, so the labels
     have to move with the mode or the page lies to the user. */
  function renderModeChrome() {
    var only = onlyMode();
    $('mode-block').checked = !only;
    $('mode-only').checked = only;

    $('countries-heading').textContent = only ? 'Allowed countries' : 'Blocked countries';
    $('languages-heading').textContent = only ? 'Allowed languages' : 'Blocked languages';
    $('row-blockUnknownCountry').hidden = only;
    $('row-onlyShowUnknown').hidden = !only;
    document.body.classList.toggle('is-only', only);

    lead('country-lead', 'Countries actually in your feed', only
      ? ' - click one to keep it. In only mode everything you do not pick is hidden, so '
        + 'picking nothing here means country is not used as a filter at all.'
      : ' - click one to block or unblock it. If a country you ticked is not in this row, '
        + 'there is nothing for it to match, which is the usual reason nothing gets hidden.');

    lead('language-lead', 'Languages actually in your feed', only
      ? ' - click one to keep it. A chip naming several languages means the writing system '
        + 'was clear but the specific language was not; keeping it keeps all of them.'
      : ' - click one to block or unblock it. A chip naming several languages means the '
        + 'writing system was clear but the specific language was not, so blocking it '
        + 'blocks all of them.');
  }

  function lead(id, boldText, rest) {
    var el = $(id);
    el.textContent = '';
    var b = document.createElement('b');
    b.textContent = boldText;
    el.appendChild(b);
    el.append(rest);
  }

  function bindMode() {
    ['mode-block', 'mode-only'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        if (!$(id).checked) return;
        save({ mode: id === 'mode-only' ? 'only' : 'block' });
        redrawAll();
      });
    });
    redraws.push(function () { renderModeChrome(); refreshOnlyNote(); });
    renderModeChrome();
  }

  /* --------------------------------------------------------- rules summary */

  function renderRulesSummary() {
    var el = $('rules-summary');
    var bits = [];
    if (state.countries.length) {
      bits.push(state.countries.length + ' countr' +
        (state.countries.length === 1 ? 'y' : 'ies'));
    }
    if (state.languages.length) {
      bits.push(state.languages.length + ' language' +
        (state.languages.length === 1 ? '' : 's'));
    }
    if (state.blocklist.length) {
      bits.push(state.blocklist.length + ' channel' +
        (state.blocklist.length === 1 ? '' : 's'));
    }
    if (state.blockUnknownCountry) bits.push('channels with no country');

    if (!state.enabled) {
      el.textContent = 'Filtering is off. Nothing will be hidden.';
      el.className = 'status err';
      return;
    }
    if (!bits.length) {
      el.textContent = 'No rules set yet, so nothing will be hidden. '
        + 'Pick a country or a language below.';
      el.className = 'status err';
      return;
    }
    if (onlyMode()) {
      var keep = [];
      if (state.countries.length) {
        keep.push(state.countries.length + ' countr' +
          (state.countries.length === 1 ? 'y' : 'ies'));
      }
      if (state.languages.length) {
        keep.push(state.languages.length + ' language' +
          (state.languages.length === 1 ? '' : 's'));
      }
      el.textContent = 'Only mode: showing ' + keep.join(' and ')
        + ', hiding everything else'
        + (state.onlyShowUnknown ? ' except what cannot be classified' : '') + '.';
      el.className = 'status';
      return;
    }
    el.textContent = 'Blocking ' + bits.join(', ') + '.';
    el.className = 'status';
  }

  /* ------------------------------------------------------------- pickers */

  /* One picker drives both lists. `field` is the settings key holding the
     selected codes; `label` turns a code into a display name. */
  function buildPicker(cfg) {
    var listEl = $(cfg.listId);
    var chipsEl = $(cfg.chipsId);
    var searchEl = $(cfg.searchId);

    var entries = cfg.codes
      .map(function (code) { return { code: code, name: cfg.label(code) }; })
      .filter(function (e) { return e.name && e.name !== e.code; })
      .sort(function (a, b) { return a.name.localeCompare(b.name); });

    function selected() { return state[cfg.field]; }

    function renderChips() {
      chipsEl.textContent = '';
      selected().slice().sort().forEach(function (code) {
        var chip = document.createElement('span');
        chip.className = 'chip';
        chip.append(cfg.label(code));

        var x = document.createElement('button');
        x.type = 'button';
        x.textContent = '\u00d7';
        x.title = 'Remove';
        x.addEventListener('click', function () { toggle(code, false); });

        chip.appendChild(x);
        chipsEl.appendChild(chip);
      });
    }

    function renderList() {
      var q = searchEl.value.trim().toLowerCase();
      listEl.textContent = '';
      entries
        .filter(function (e) {
          return !q || e.name.toLowerCase().indexOf(q) !== -1 || e.code.toLowerCase().indexOf(q) === 0;
        })
        .slice(0, 400)
        .forEach(function (e) {
          var label = document.createElement('label');
          var box = document.createElement('input');
          box.type = 'checkbox';
          box.checked = selected().indexOf(e.code) !== -1;
          box.addEventListener('change', function () { toggle(e.code, box.checked); });

          var code = document.createElement('span');
          code.className = 'code';
          code.textContent = e.code;

          label.appendChild(box);
          label.append(e.name);
          label.appendChild(code);
          listEl.appendChild(label);
        });
    }

    function toggle(code, on) {
      var next = selected().filter(function (c) { return c !== code; });
      if (on) next.push(code);
      var patch = {};
      patch[cfg.field] = next;
      save(patch);
      redrawAll();
    }

    searchEl.addEventListener('input', renderList);
    redraws.push(function () { renderChips(); renderList(); });
    renderChips();
    renderList();
  }

  /* --------------------------------------------------------------- setup */

  function bindToggles() {
    TOGGLES.forEach(function (id) {
      var el = $(id);
      el.checked = !!state[id];
      el.addEventListener('change', function () {
        var patch = {};
        patch[id] = el.checked;
        save(patch);
        redrawAll();
      });
    });
  }

  function bindThreshold() {
    var el = $('langThreshold');
    var out = $('threshold-value');
    el.value = state.langThreshold;
    out.textContent = state.langThreshold;
    el.addEventListener('input', function () { out.textContent = el.value; });
    el.addEventListener('change', function () { save({ langThreshold: Number(el.value) }); });
  }

  /* The blocklist and allowlist are the same control twice over. Editing one
     removes any channel it gained from the other, so a channel can never be in
     both. */
  function bindChannelList(field, otherField) {
    var el = $(field);
    var other = $(otherField);

    function render() {
      el.value = state[field].join('\n');
      other.value = state[otherField].join('\n');
    }

    el.addEventListener('change', function () {
      var list = el.value
        .split('\n')
        .map(function (line) { return BEEJ.channelKey(line.trim()); })
        .filter(Boolean);

      // De-duplicate while keeping the order the user typed.
      var seen = {};
      list = list.filter(function (k) {
        if (seen[k]) return false;
        seen[k] = true;
        return true;
      });

      var patch = {};
      patch[field] = list;
      patch[otherField] = state[otherField].filter(function (k) {
        return list.indexOf(k) === -1;
      });
      save(patch);
      render();
    });

    render();
  }

  /* Reflect edits made elsewhere - notably the "Block this YouTube channel"
     context menu - while this page is open. */
  function watchExternalEdits() {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'sync') return;
      BEEJ.getSettings().then(function (s) {
        var listsChanged = s.blocklist.join() !== state.blocklist.join()
          || s.allowlist.join() !== state.allowlist.join();
        state = s;
        redrawAll();
        if (listsChanged) {
          $('blocklist').value = s.blocklist.join('\n');
          $('allowlist').value = s.allowlist.join('\n');
          flashSaved();
        }
      });
    });
  }

  function bindApiKey() {
    var el = $('apiKey');
    var status = $('key-status');
    el.value = state.apiKey || '';
    el.addEventListener('change', function () { save({ apiKey: el.value.trim() }); });

    $('test-key').addEventListener('click', function () {
      var key = el.value.trim();
      if (!key) {
        status.textContent = 'Enter a key first.';
        status.className = 'status err';
        return;
      }
      status.textContent = 'Testing\u2026';
      status.className = 'status';
      chrome.runtime.sendMessage({ type: 'beej:testApiKey', apiKey: key }, function (res) {
        if (!res) {
          status.textContent = 'No response from the extension.';
          status.className = 'status err';
          return;
        }
        status.textContent = res.ok ? 'Key works.' : 'Key rejected \u2014 ' + res.detail;
        status.className = res.ok ? 'status' : 'status err';
      });
    });
  }

  /* --------------------------------------------------------- block log */

  var blockLog = [];

  function reasonLabel(e) {
    if (e.kind === 'language') {
      return 'language: ' + (e.detail ? BEEJ.languageName(e.detail) : 'unknown');
    }
    if (e.kind === 'country') {
      return e.detail ? 'country: ' + BEEJ.countryName(e.detail) : 'no country declared';
    }
    return 'blocked channel';
  }

  function renderBlockLog() {
    var table = $('log-table');
    var kind = $('log-filter').value;
    var q = $('log-search').value.trim().toLowerCase();

    var counts = { language: 0, country: 0, manual: 0 };
    blockLog.forEach(function (e) {
      if (counts[e.kind] !== undefined) counts[e.kind]++;
    });

    var shown = blockLog.filter(function (e) {
      if (kind && e.kind !== kind) return false;
      if (!q) return true;
      return (e.title || '').toLowerCase().indexOf(q) !== -1
        || (e.name || '').toLowerCase().indexOf(q) !== -1
        || (e.key || '').toLowerCase().indexOf(q) !== -1;
    });

    $('log-summary').textContent = blockLog.length
      ? blockLog.length + ' hidden (' + counts.language + ' language, ' +
        counts.country + ' country, ' + counts.manual + ' blocked channel)' +
        (shown.length !== blockLog.length ? ', ' + shown.length + ' shown' : '') + '.'
      : 'Nothing hidden yet.';

    table.textContent = '';

    if (!shown.length) {
      var empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = blockLog.length
        ? 'Nothing matches that filter.'
        : 'Nothing hidden yet. Pick a country or language above, browse YouTube, then reopen this page.';
      table.appendChild(empty);
      return;
    }

    shown.slice(0, 400).forEach(function (e) {
      var row = document.createElement('div');
      row.className = 'trow';

      var cell = document.createElement('span');
      cell.style.minWidth = '0';

      var title = document.createElement('div');
      title.className = 'trow__title';
      title.textContent = e.title || '(no title)';
      title.title = e.title || '';

      var sub = document.createElement('div');
      sub.className = 'trow__sub';
      sub.textContent = e.name || e.key || 'unknown channel';

      cell.appendChild(title);
      cell.appendChild(sub);

      var state_ = document.createElement('span');
      state_.className = 'trow__state bad';
      state_.textContent = reasonLabel(e);

      var actions = document.createElement('span');
      actions.className = 'trow__actions';
      if (e.key) {
        actions.appendChild(actionButton('Allow channel', false, function () {
          BEEJ.addToChannelList('allowlist', e.key).then(refreshAfterEdit);
        }));
      }

      row.appendChild(cell);
      row.appendChild(state_);
      row.appendChild(actions);
      table.appendChild(row);
    });
  }

  function loadBlockLog() {
    chrome.runtime.sendMessage({ type: 'beej:blockLog' }, function (res) {
      blockLog = (res && res.entries) || [];
      renderBlockLog();
    });
    refreshOnlyNote();
  }

  /* Only mode hides most of a feed by design, so it keeps a counter instead of
     400 near-identical log rows. Say so, or the empty log looks broken. */
  function refreshOnlyNote() {
    var el = $('only-note');
    if (!onlyMode()) { el.hidden = true; return; }
    chrome.runtime.sendMessage({ type: 'beej:hiddenCount' }, function (res) {
      var n = (res && res.n) || 0;
      el.hidden = false;
      el.textContent = 'Only mode has hidden ' + n + ' item' + (n === 1 ? '' : 's') +
        ' for not matching your selections. Those are counted rather than listed, ' +
        'since in only mode that is most of the feed. Rows above are channels you ' +
        'blocked by hand and full-page blocks.';
    });
  }

  function bindBlockLog() {
    $('log-filter').addEventListener('change', renderBlockLog);
    $('log-search').addEventListener('input', renderBlockLog);
    $('clear-log').addEventListener('click', function () {
      chrome.runtime.sendMessage({ type: 'beej:clearBlockLog' }, function () {
        blockLog = [];
        renderBlockLog();
        flashSaved();
      });
    });
    loadBlockLog();
  }

  /* ------------------------------------------------------ channel table */

  var channels = [];
  var langTally = {};

  /* What the current rules do with one channel. Mirrors the precedence in
     observer.js: allowlist first, then an explicit block, then country. */
  /* This is a prediction, not a history: what the rules will do the next time a
     video from this channel shows up. The wording says "would hide" for exactly
     that reason - a channel can be listed here and still have nothing in the
     block log, because it was looked up before the rule existed. */
  function statusOf(ch) {
    if (state.allowlist.indexOf(ch.key) !== -1) {
      return { label: 'never hidden', cls: 'ok' };
    }
    if (state.blocklist.indexOf(ch.key) !== -1) {
      return { label: 'would hide: blocked channel', cls: 'bad' };
    }
    if (onlyMode()) {
      if (!state.countries.length) {
        return { label: ch.country ? BEEJ.countryName(ch.country) : 'no country declared', cls: '' };
      }
      if (!ch.country) {
        return state.onlyShowUnknown
          ? { label: 'kept: no country declared', cls: '' }
          : { label: 'would hide: no country declared', cls: 'bad' };
      }
      return state.countries.indexOf(ch.country) !== -1
        ? { label: 'kept: ' + BEEJ.countryName(ch.country), cls: '' }
        : { label: 'would hide: ' + BEEJ.countryName(ch.country), cls: 'bad' };
    }
    if (ch.country && state.countries.indexOf(ch.country) !== -1) {
      return { label: 'would hide: ' + BEEJ.countryName(ch.country), cls: 'bad' };
    }
    if (!ch.country && state.blockUnknownCountry) {
      return { label: 'would hide: no country', cls: 'bad' };
    }
    return {
      label: ch.country ? BEEJ.countryName(ch.country) : 'no country declared',
      cls: ''
    };
  }

  function actionButton(text, pressed, onClick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'tbtn';
    b.textContent = text;
    b.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    b.addEventListener('click', onClick);
    return b;
  }

  /* What is actually in this feed, as clickable chips. The bridge between
     "171 channels cached" and "why is nothing hidden": if what you ticked is
     not in here, it cannot match anything.

     cfg: { wrapId, counts: {key: n}, label(key), isPressed(key),
            onToggle(key, pressed) } */
  function renderChips_(cfg) {
    var wrap = $(cfg.wrapId);
    wrap.textContent = '';

    var entries = Object.keys(cfg.counts).map(function (k) {
      return { key: k, n: cfg.counts[k] };
    }).sort(function (a, b) {
      if (b.n !== a.n) return b.n - a.n;
      return a.key.localeCompare(b.key);
    });

    if (!entries.length) {
      var none = document.createElement('span');
      none.className = 'empty';
      none.style.padding = '0';
      none.textContent = cfg.emptyText;
      wrap.appendChild(none);
      return;
    }

    entries.forEach(function (e) {
      var pressed = cfg.isPressed(e.key);

      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip chip--toggle';
      chip.setAttribute('aria-pressed', pressed ? 'true' : 'false');
      chip.title = pressed ? 'Click to stop blocking' : 'Click to block';
      chip.append(cfg.label(e.key));

      var n = document.createElement('span');
      n.className = 'chip__count';
      n.textContent = String(e.n);
      chip.appendChild(n);

      chip.addEventListener('click', function () {
        cfg.onToggle(e.key, pressed);
        redrawAll();
      });

      wrap.appendChild(chip);
    });
  }

  function renderCountryBreakdown() {
    var counts = {};
    channels.forEach(function (ch) {
      var k = ch.country || '';
      counts[k] = (counts[k] || 0) + 1;
    });

    renderChips_({
      wrapId: 'country-breakdown',
      counts: counts,
      emptyText: 'Nothing looked up yet. Tick a country below, browse YouTube, then reopen this page.',
      label: function (k) { return k ? BEEJ.countryName(k) : 'no country declared'; },
      isPressed: function (k) {
        return k ? state.countries.indexOf(k) !== -1 : state.blockUnknownCountry;
      },
      onToggle: function (k, pressed) {
        if (!k) {
          save({ blockUnknownCountry: !state.blockUnknownCountry });
          $('blockUnknownCountry').checked = state.blockUnknownCountry;
          return;
        }
        var next = state.countries.filter(function (c) { return c !== k; });
        if (!pressed) next.push(k);
        save({ countries: next });
      }
    });
  }

  /* A tally key is the whole verdict set: 'ne' when the language was pinned
     down, 'hi,mr,ne' when only the script was. Blocking an ambiguous chip
     blocks every language in it, which is what the label says it does. */
  function renderLanguageBreakdown() {
    renderChips_({
      wrapId: 'language-breakdown',
      counts: langTally,
      emptyText: 'Nothing detected yet. Browse YouTube for a moment, then reopen this page.',
      label: function (k) {
        return k.split(',').map(BEEJ.languageName).join(' / ');
      },
      isPressed: function (k) {
        var codes = k.split(',');
        return codes.some(function (c) { return state.languages.indexOf(c) !== -1; });
      },
      onToggle: function (k, pressed) {
        var codes = k.split(',');
        var next = state.languages.filter(function (c) { return codes.indexOf(c) === -1; });
        if (!pressed) next = next.concat(codes);
        save({ languages: next });
      }
    });
  }

  function renderChannels() {
    renderCountryBreakdown();
    renderLanguageBreakdown();
    renderRulesSummary();

    var table = $('channel-table');
    var q = $('channel-search').value.trim().toLowerCase();
    var blockedOnly = $('channel-blocked-only').checked;

    var rows = channels.map(function (ch) {
      return { ch: ch, st: statusOf(ch) };
    });

    var blockedCount = rows.filter(function (r) { return r.st.cls === 'bad'; }).length;

    var shown = rows.filter(function (r) {
      if (blockedOnly && r.st.cls !== 'bad') return false;
      if (!q) return true;
      return r.ch.key.toLowerCase().indexOf(q) !== -1
        || r.st.label.toLowerCase().indexOf(q) !== -1;
    });

    // Blocked first, then alphabetical, so the interesting rows are on top.
    shown.sort(function (a, b) {
      if ((a.st.cls === 'bad') !== (b.st.cls === 'bad')) return a.st.cls === 'bad' ? -1 : 1;
      return a.ch.key.localeCompare(b.ch.key);
    });

    $('channel-summary').textContent =
      channels.length + ' channel' + (channels.length === 1 ? '' : 's') + ' known, ' +
      blockedCount + ' your rules would hide' +
      (shown.length !== rows.length ? ' (' + shown.length + ' shown)' : '') + '.';

    table.textContent = '';

    if (!shown.length) {
      var empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = channels.length
        ? 'Nothing matches that filter.'
        : 'Nothing looked up yet. Browse YouTube for a moment, then reopen this page.';
      table.appendChild(empty);
      return;
    }

    shown.slice(0, 500).forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'trow';

      var name = document.createElement('span');
      name.className = 'trow__name';
      name.textContent = r.ch.key;
      name.title = r.ch.key + (r.ch.source ? ' (via ' + r.ch.source + ')' : '');

      var state_ = document.createElement('span');
      state_.className = 'trow__state ' + r.st.cls;
      state_.textContent = r.st.label;

      var actions = document.createElement('span');
      actions.className = 'trow__actions';

      var isBlocked = state.blocklist.indexOf(r.ch.key) !== -1;
      var isAllowed = state.allowlist.indexOf(r.ch.key) !== -1;

      actions.appendChild(actionButton('Block', isBlocked, function () {
        (isBlocked ? BEEJ.clearChannelLists(r.ch.key)
                   : BEEJ.addToChannelList('blocklist', r.ch.key)).then(refreshAfterEdit);
      }));
      actions.appendChild(actionButton('Allow', isAllowed, function () {
        (isAllowed ? BEEJ.clearChannelLists(r.ch.key)
                   : BEEJ.addToChannelList('allowlist', r.ch.key)).then(refreshAfterEdit);
      }));

      row.appendChild(name);
      row.appendChild(state_);
      row.appendChild(actions);
      table.appendChild(row);
    });
  }

  /* The helpers write straight to storage, so pull the settings back rather
     than assuming what landed. */
  function refreshAfterEdit() {
    return BEEJ.getSettings().then(function (s) {
      state = s;
      $('blocklist').value = s.blocklist.join('\n');
      $('allowlist').value = s.allowlist.join('\n');
      redrawAll();
      renderBlockLog();
      flashSaved();
    });
  }

  function bindChannelTable() {
    $('channel-search').addEventListener('input', renderChannels);
    $('channel-blocked-only').addEventListener('change', renderChannels);

    redraws.push(renderChannels);
    chrome.runtime.sendMessage({ type: 'beej:channelList' }, function (res) {
      channels = (res && res.channels) || [];
      renderChannels();
    });
    chrome.runtime.sendMessage({ type: 'beej:langTally' }, function (res) {
      langTally = (res && res.tally) || {};
      renderLanguageBreakdown();
    });
  }

  function bindCache() {
    function refresh() {
      chrome.runtime.sendMessage({ type: 'beej:cacheStats' }, function (res) {
        if (!res) return;
        $('cache-status').textContent =
          res.total + ' channel' + (res.total === 1 ? '' : 's') + ' cached, ' +
          res.resolved + ' with a declared country.';
      });
    }
    $('clear-cache').addEventListener('click', function () {
      chrome.runtime.sendMessage({ type: 'beej:clearCache' }, function () {
        // Both tables are views onto "what Beej has seen", so they empty with
        // it. Manual block/allow entries live in settings and are untouched.
        channels = [];
        langTally = {};
        renderChannels();
        flashSaved();
        refresh();
      });
    });
    refresh();
  }

  BEEJ.getSettings().then(function (s) {
    state = s;
    bindMode();
    bindToggles();
    bindThreshold();
    bindChannelList('blocklist', 'allowlist');
    bindChannelList('allowlist', 'blocklist');
    bindApiKey();
    bindBlockLog();
    bindChannelTable();
    bindCache();
    watchExternalEdits();

    buildPicker({
      listId: 'country-list',
      chipsId: 'country-chips',
      searchId: 'country-search',
      field: 'countries',
      codes: BEEJ_DATA.COUNTRY_CODES,
      label: BEEJ.countryName
    });

    buildPicker({
      listId: 'language-list',
      chipsId: 'language-chips',
      searchId: 'language-search',
      field: 'languages',
      codes: BEEJ_DATA.LANGUAGE_CODES,
      label: BEEJ.languageName
    });

    renderRulesSummary();
  });
})();
