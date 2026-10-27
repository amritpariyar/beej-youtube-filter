# Privacy Policy — Beej

**Last updated:** 27 October 2026

Beej filters what you see on YouTube. It does not have a server, an account, or an
analytics endpoint. **No data leaves your computer.**

## What Beej stores, and where

Everything is kept in Chrome's own extension storage on your machine.

| What | Where | Why | Cleared by |
|---|---|---|---|
| Your rules — blocked countries, languages, channel block/allow lists, toggles | `chrome.storage.sync` | So the extension knows what to hide | Uninstalling, or editing them in options |
| Channel countries — a channel handle and the country it declares publicly | `chrome.storage.local` | So a channel is looked up once a month rather than once a page | **Clear cache** in options; 30-day expiry |
| Language tally — counts of languages seen, e.g. `en: 132` | `chrome.storage.local` | To show which languages are in your feed | **Clear cache** in options |
| Block log — up to 400 recent entries: video title, channel, reason, timestamp | `chrome.storage.local` | So you can see what was hidden and undo mistakes | **Clear** in options |
| YouTube Data API key, if you choose to add one | `chrome.storage.sync` | Optional fallback for country lookups | Clearing the field in options |
| Beej Pro licence key, if you enter one — it contains the email address it was sold to | `chrome.storage.sync` | To unlock Pro features. The key is checked on your machine; it is never sent anywhere | Uninstalling |
| Parental lock — a salted hash of the PIN and of the recovery code, never the PIN itself, plus a count of recent wrong attempts | `chrome.storage.sync` (hashes), `chrome.storage.local` (attempt count) | So the options page can check the PIN | **Turn lock off** in options |

`chrome.storage.sync` is synchronised by Chrome across browsers you are signed into, under
your own Google account, exactly as your bookmarks are. Beej neither controls nor can read
that transport. If you would rather nothing synchronised, sign out of Chrome sync or do not
enter an API key.

The block log is the only store that records anything resembling browsing activity — the
titles of videos that were hidden. It never leaves the machine, is capped at 400 entries,
and has its own Clear button.

## What Beej sends, and to whom

Three requests, all to YouTube/Google, all only about public channel and video metadata:

1. **`https://www.youtube.com/@handle/about`** — the channel's public About page, to read
   the country the creator declares. This is the same page you can open yourself. It is
   requested only for channels that appear in your feed, and only while a country rule is
   active.
2. **`https://www.youtube.com/oembed`** — YouTube's public description of a single video,
   to read which channel uploaded it and its title. It is requested for the video you open
   on a watch or Shorts page while Beej is set to block watch pages, or when you right-click
   and choose "Block the channel on this page". It is about that video only.
3. **`https://youtube.googleapis.com/youtube/v3/channels`** — only if you supply your own
   YouTube Data API key, as a fallback when the first request does not yield a country.

No request carries your rules, your history, an identifier, or anything about you beyond
what a normal browser request to YouTube already carries.

## What Beej does not do

- No analytics, telemetry, crash reporting, or usage statistics
- No advertising, tracking pixels, fingerprinting, or third-party scripts
- No selling, sharing, or transferring of data to anyone
- No remotely hosted code — everything that runs is in the package you installed
- No reading or modifying of any site other than `www.youtube.com`
- No access to your YouTube account, watch history, subscriptions, or cookies beyond what
  the browser attaches to an ordinary request

## Permissions, and why each is needed

- **`storage`** — to keep your rules and caches described above.
- **`contextMenus`** — for the right-click "Block this YouTube channel" item.
- **`scripting`** — to start filtering in YouTube tabs that were already open when the
  extension loaded or updated, instead of making you reload them.
- **`https://www.youtube.com/*`** — to hide videos on the page, to read public channel
  About pages, and to look up which channel a video belongs to. This is the extension's entire purpose.
- **`https://youtube.googleapis.com/*`** — used only if you enter your own API key.

## Removing everything

Uninstalling Beej deletes all of it. Before that, **Clear cache** and **Clear** in options
empty the stores individually.

## Contact

Questions about this policy can be sent to info@beejtechnologies.com.np or
+977 9762565115.

This policy is published at <https://beejtechnologies.com.np/privacy-policy/youtube-filter>.
