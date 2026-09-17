/* Language verdict for a piece of text, decided entirely on-device.

   Two passes, cheapest first:
     1. Unicode script. Decisive for every non-Latin writing system and costs
        one regex sweep. A Devanagari title is Hindi-family, full stop.
     2. chrome.i18n.detectLanguage (CLD). Only consulted for Latin script,
        where script tells us nothing.

   A verdict of null means "don't know", and an unknown language is never
   blocked. Short YouTube titles are exactly the input CLD is worst at, so the
   bias here is deliberately toward letting things through. */

var BEEJ_LANG = (function () {
  'use strict';

  var SCRIPT_SHARE = 0.30;   // fraction of letters in one block to call it
  var MIN_CHARS = 8;         // below this, CLD output is noise

  var RE_URL = /https?:\/\/\S+/g;
  var RE_TAG = /[#@][\w\u0080-\uffff]+/g;
  var RE_BRACKETED = /[\[\(\{][^\]\)\}]{0,40}[\]\)\}]/gu;
  var RE_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;
  var RE_DIGITS = /[0-9]+/g;
  // Hyphen stays last so it is a literal, not a range endpoint.
  var RE_PUNCT = /[|\u2022\u00b7\u2014\u2013_+*=~^<>"'`!?.,:;\/\\-]+/g;
  var RE_LETTER = /\p{L}/gu;

  /* Strip everything that carries no language signal but does skew the
     detector: urls, hashtags, @mentions, emoji, digits, bracketed tags. */
  function normalise(text) {
    return String(text || '')
      .replace(RE_URL, ' ')
      .replace(RE_TAG, ' ')
      .replace(RE_BRACKETED, ' ')
      .replace(RE_EMOJI, ' ')
      .replace(RE_DIGITS, ' ')
      .replace(RE_PUNCT, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function scriptVerdict(text) {
    RE_LETTER.lastIndex = 0;
    var letters = (text.match(RE_LETTER) || []).length;
    if (letters < 4) return null;

    var best = null;
    for (var i = 0; i < BEEJ_DATA.SCRIPTS.length; i++) {
      var s = BEEJ_DATA.SCRIPTS[i];
      s.re.lastIndex = 0;
      var n = (text.match(s.re) || []).length;
      if (n / letters >= SCRIPT_SHARE && (!best || n > best.n)) {
        best = { n: n, langs: s.langs, script: s.name };
      }
    }
    if (!best) return null;
    return { langs: best.langs, source: 'script:' + best.script, confidence: 100 };
  }

  function cldVerdict(text, threshold) {
    return new Promise(function (resolve) {
      if (typeof chrome === 'undefined' || !chrome.i18n || !chrome.i18n.detectLanguage) return resolve(null);
      try {
        chrome.i18n.detectLanguage(text, function (res) {
          if (chrome.runtime.lastError || !res || !res.languages || !res.languages.length) {
            return resolve(null);
          }
          var top = res.languages[0];
          var code = String(top.language || '').split('-')[0];
          if (!code || code === 'und') return resolve(null);
          if (!res.isReliable || top.percentage < threshold) return resolve(null);
          resolve({ langs: [code], source: 'cld', confidence: top.percentage });
        });
      } catch (e) {
        resolve(null);
      }
    });
  }

  /* Resolves to {langs, source, confidence} or null.

     Script settles the writing system; it does not settle the language. Several
     scripts carry more than one (Devanagari is Hindi and Marathi and Nepali),
     and treating them as interchangeable means someone who wants Hindi gone
     loses Nepali too. So for an ambiguous script, ask CLD to narrow within the
     candidate set, and keep the whole set only when it cannot. */
  function detect(text, threshold) {
    var clean = normalise(text);
    if (clean.length < MIN_CHARS) return Promise.resolve(null);
    var floor = typeof threshold === 'number' ? threshold : 70;

    var byScript = scriptVerdict(clean);
    if (!byScript) return cldVerdict(clean, floor);
    if (byScript.langs.length === 1) return Promise.resolve(byScript);

    return cldVerdict(clean, floor).then(function (cld) {
      if (cld && byScript.langs.indexOf(cld.langs[0]) !== -1) {
        return {
          langs: [cld.langs[0]],
          source: byScript.source + '+cld',
          confidence: cld.confidence
        };
      }
      return byScript;
    });
  }

  /* Returns the offending language code, or null. Script verdicts carry several
     candidate languages (Cyrillic -> ru/uk/bg/sr); blocking any one of them
     blocks the tile, which is what a user picking "Russian" to get rid of
     Cyrillic content actually means. */
  function isBlocked(verdict, blocked) {
    if (!verdict || !blocked || !blocked.length) return null;
    for (var i = 0; i < verdict.langs.length; i++) {
      if (blocked.indexOf(verdict.langs[i]) !== -1) return verdict.langs[i];
    }
    return null;
  }

  return { detect: detect, isBlocked: isBlocked, normalise: normalise };
})();
