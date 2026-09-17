# Chrome Web Store listing — copy and answers

Everything the submission form asks for, drafted. Paste from here.

---

## Name (max 75)

```
Beej: Country, Language and Channel Filter for YouTube
```

The trademark deliberately does not lead the name. Google rejects listings whose title
implies affiliation; `<Brand>: <what it does> for YouTube` is the accepted pattern.

## Short description (max 132)

```
Hide YouTube videos by channel country and content language, or block channels outright. All on your machine.
```

## Category

`Productivity` (sub-category: Workflow & Planning). Not "Fun" — this is a filtering tool.

## Detailed description

```
Beej hides YouTube videos by where a channel says it is from, by what language the content
is in, and by channel when you just want one gone. Other blockers stop at the channel name;
Beej adds origin and language, so you do not have to block channels one at a time forever.

WHAT IT DOES

- Block by country. Reads the country a creator publicly declares on their channel and
  hides their videos across home, search and the feed.
- Block by language. Detects the language of each video on your own machine and hides the
  ones you do not want. Works for every writing system.
- Block individual channels. Right-click any channel name and choose "Block this YouTube
  channel", or right-click the page while watching a video.
- Choose where it applies. Feeds, the watch page, channel pages - each can be turned on or
  off independently.

SEE WHAT IT IS DOING

- "Countries actually in your feed" and "Languages actually in your feed" show what you
  really have, with counts, so you pick from reality instead of guessing.
- A running record of what was hidden and why, with a one-click undo on each row.
- An allow-list for channels that should never be filtered.

PRIVACY

There is no server, no account and no analytics. Your rules and caches stay in the browser.
Nothing is collected, and nothing is sold or shared. The only network requests are to
YouTube itself, for the public About page of channels in your feed.

HONEST LIMITS

- Country is self-declared by the creator and is optional, so some channels have none.
  This filters declared origin. It is not a geolocation tool.
- Language is inferred from the video title, not the audio. A Hindi video with an English
  title will get through.
- Shorts and the watch-page sidebar do not expose a channel link, so country rules cannot
  apply there. Language filtering still works.
```

## Permission justifications

Paste each into its box. Reviewers reject vague answers; each names the feature it serves.

**`storage`**
```
Stores the user's filter rules (blocked countries, languages, channel lists) and a local
cache of channel countries so the same channel is not looked up repeatedly. Local only;
nothing is transmitted.
```

**`contextMenus`**
```
Adds the "Block this YouTube channel" right-click item, which is the primary way users add
a channel to their block list without typing its handle.
```

**`scripting`**
```
Injects the content script into YouTube tabs that were already open when the extension was
installed or updated. Without it those tabs stay unfiltered until manually reloaded. It is
only ever called with the extension's own bundled files, on youtube.com tabs.
```

**Host permission `https://www.youtube.com/*`**
```
The extension's entire function. Needed to hide video tiles on the page and to read the
public "About" page of channels appearing in the feed, which is where YouTube publishes the
country a creator declares.
```

**Host permission `https://youtube.googleapis.com/*`**
```
Used only if the user supplies their own YouTube Data API key in options, as a fallback for
reading a channel's country. No key is bundled and the endpoint is never contacted
otherwise.
```

**Single purpose**
```
Filtering which YouTube videos are shown, based on channel country and content language.
```

**Remote code**
```
No. All code is in the package. No eval, no remotely hosted scripts.
```

## Data usage disclosures

Tick **"I do not sell or transfer user data to third parties"**, **"... not using or
transferring for purposes unrelated to the single purpose"**, and **"... not using or
transferring to determine creditworthiness or for lending"**.

For the data-collection checkboxes: **tick nothing**. Beej collects no category. The block
log records video titles, but it never leaves the device, which is not "collection" under
the policy (no transmission). If in doubt, say so plainly in the justification box rather
than leaving it blank.

Privacy policy URL - **this field is mandatory**. Paste exactly this:

```
https://github.com/amritpariyar/beej-extension/blob/main/PRIVACY.md
```

It serves `PRIVACY.md` from the public repo, so editing the file and pushing updates the
policy at the same URL.

## Graphical assets

| Asset | Size | Status |
|---|---|---|
| Store icon | 128x128 PNG | done - `src/icons/icon128.png` |
| Screenshot | 1280x800 or 640x400, at least 1, up to 5 | done - `store/screenshot-1..4-*.png` |
| Small promo tile | 440x280 PNG | draft - `store/promo-440x280.png` |
| Marquee promo | 1400x560 PNG | optional, only for featuring |

Four are ready, all 1280x800, cropped at native resolution from a full-page capture of a
real options page (`store/source-capture-options-fullpage.png`, kept as the source to
re-crop from):

1. `screenshot-1-rules.png` - header, mode picker, and the populated country chips
2. `screenshot-2-languages.png` - language chips and the confidence floor
3. `screenshot-3-blocked.png` - "What has been blocked" with real rows
4. `screenshot-4-channels.png` - "Channels Beej has seen" predictions
5. `screenshot-5-feed-before-after.png` - the home feed side by side, unfiltered against
   only mode set to France and French. The one shot of Beej working on YouTube itself,
   composed by `tools/compose_store_shot.py` from two full-page captures.

Lead with number 5 in the store. It is the only one that shows the product doing its job;
the rest are settings.

## Before you submit

- [ ] Register as a developer: one-off 5 USD fee at the Developer Dashboard
- [ ] `npm run pack` or the zip command in README; upload the zip, not the folder
- [x] Privacy policy hosted at a public URL (paste it into the form)
- [x] At least one real screenshot
- [ ] Bump `version` in `manifest.json` for every resubmission - the store rejects a
      repeated version number
- [ ] Expect a few days for first review; extensions with broad host permissions sometimes
      take longer
