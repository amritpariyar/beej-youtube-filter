/* Static reference data, shared by the content scripts and the service worker.
   Loaded as a classic script in both worlds, so it must not use `import`. */

var BEEJ_DATA = (function () {
  'use strict';

  // ISO 3166-1 alpha-2. Display names come from Intl.DisplayNames at runtime,
  // so this list stays a list of codes and localises itself for free.
  var COUNTRY_CODES = (
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ ' +
    'BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR ' +
    'CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR ' +
    'GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ' +
    'ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ ' +
    'LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ ' +
    'MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF ' +
    'PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI ' +
    'SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR ' +
    'TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW'
  ).split(' ');

  // ISO 639-1, restricted to languages that actually show up on YouTube at scale.
  var LANGUAGE_CODES = (
    'af am ar az be bg bn bs ca cs cy da de el en es et eu fa fi fil fr ga gl gu ' +
    'ha he hi hr hu hy id ig is it ja jv ka kk km kn ko ku ky lo lt lv mk ml mn ' +
    'mr ms my ne nl no pa pl ps pt ro ru si sk sl so sq sr su sv sw ta te tg th ' +
    'tl tr uk ur uz vi yo zh zu'
  ).split(' ');

  /* Country names as YouTube renders them do not always match what
     Intl.DisplayNames produces for the same code. These are the divergences
     worth hard-coding; everything else round-trips through Intl. */
  var COUNTRY_NAME_ALIASES = {
    'south korea': 'KR',
    'korea, south': 'KR',
    'republic of korea': 'KR',
    'north korea': 'KP',
    'russia': 'RU',
    'russian federation': 'RU',
    'vietnam': 'VN',
    'viet nam': 'VN',
    'taiwan': 'TW',
    'hong kong': 'HK',
    'macau': 'MO',
    'macao': 'MO',
    'united states of america': 'US',
    'usa': 'US',
    'uk': 'GB',
    'great britain': 'GB',
    'czech republic': 'CZ',
    'czechia': 'CZ',
    'ivory coast': 'CI',
    "cote d'ivoire": 'CI',
    'cape verde': 'CV',
    'east timor': 'TL',
    'timor-leste': 'TL',
    'myanmar (burma)': 'MM',
    'burma': 'MM',
    'laos': 'LA',
    'syria': 'SY',
    'iran': 'IR',
    'bolivia': 'BO',
    'venezuela': 'VE',
    'tanzania': 'TZ',
    'moldova': 'MD',
    'palestine': 'PS',
    'vatican city': 'VA',
    'holland': 'NL',
    'netherlands (the)': 'NL',
    'the netherlands': 'NL',
    'congo - kinshasa': 'CD',
    'congo - brazzaville': 'CG',
    'dr congo': 'CD',
    'swaziland': 'SZ',
    'eswatini': 'SZ',
    'turkiye': 'TR',
    't\u00fcrkiye': 'TR',
    'turkey': 'TR'
  };

  /* Unicode-block fast path. A title written in Devanagari is Hindi-or-similar
     no matter what a statistical detector thinks of six words, so script wins
     when it is decisive. Each entry maps a block to the plausible languages;
     the first is used as the representative verdict. */
  var SCRIPTS = [
    { name: 'devanagari', re: /[\u0900-\u097F]/g, langs: ['hi', 'mr', 'ne'] },
    { name: 'bengali',    re: /[\u0980-\u09FF]/g, langs: ['bn'] },
    { name: 'gurmukhi',   re: /[\u0A00-\u0A7F]/g, langs: ['pa'] },
    { name: 'gujarati',   re: /[\u0A80-\u0AFF]/g, langs: ['gu'] },
    { name: 'tamil',      re: /[\u0B80-\u0BFF]/g, langs: ['ta'] },
    { name: 'telugu',     re: /[\u0C00-\u0C7F]/g, langs: ['te'] },
    { name: 'kannada',    re: /[\u0C80-\u0CFF]/g, langs: ['kn'] },
    { name: 'malayalam',  re: /[\u0D00-\u0D7F]/g, langs: ['ml'] },
    { name: 'sinhala',    re: /[\u0D80-\u0DFF]/g, langs: ['si'] },
    { name: 'thai',       re: /[\u0E00-\u0E7F]/g, langs: ['th'] },
    { name: 'lao',        re: /[\u0E80-\u0EFF]/g, langs: ['lo'] },
    { name: 'myanmar',    re: /[\u1000-\u109F]/g, langs: ['my'] },
    { name: 'georgian',   re: /[\u10A0-\u10FF]/g, langs: ['ka'] },
    { name: 'khmer',      re: /[\u1780-\u17FF]/g, langs: ['km'] },
    { name: 'ethiopic',   re: /[\u1200-\u137F]/g, langs: ['am'] },
    { name: 'hebrew',     re: /[\u0590-\u05FF]/g, langs: ['he'] },
    { name: 'arabic',     re: /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/g, langs: ['ar', 'ur', 'fa', 'ps'] },
    { name: 'cyrillic',   re: /[\u0400-\u04FF]/g, langs: ['ru', 'uk', 'bg', 'sr'] },
    { name: 'greek',      re: /[\u0370-\u03FF]/g, langs: ['el'] },
    { name: 'armenian',   re: /[\u0530-\u058F]/g, langs: ['hy'] },
    { name: 'hangul',     re: /[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g, langs: ['ko'] },
    { name: 'kana',       re: /[\u3040-\u309F\u30A0-\u30FF]/g, langs: ['ja'] },
    { name: 'han',        re: /[\u4E00-\u9FFF\u3400-\u4DBF]/g, langs: ['zh', 'ja'] }
  ];

  return {
    COUNTRY_CODES: COUNTRY_CODES,
    LANGUAGE_CODES: LANGUAGE_CODES,
    COUNTRY_NAME_ALIASES: COUNTRY_NAME_ALIASES,
    SCRIPTS: SCRIPTS
  };
})();

if (typeof self !== 'undefined') { self.BEEJ_DATA = BEEJ_DATA; }
