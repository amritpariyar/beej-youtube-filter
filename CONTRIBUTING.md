# Contributing to Beej

Thanks for helping. Bug reports, fixes, new filters and better docs are all welcome.

## Reporting a bug

Found a way past the parental lock? Report it privately, as [SECURITY.md](SECURITY.md)
describes, rather than in a public issue.

Otherwise, open an issue with:

- what you expected and what happened instead
- the YouTube page (home, search, watch, channel, Shorts) and, if you can, a video or
  channel link that shows it
- your Chrome version and Beej version (from `chrome://extensions`)
- your mode and rules, roughly ("only mode, Nepali")

For a tile hidden by mistake, right-click it and choose **Inspect**. The hidden element
carries a `data-beej-reason` attribute that names the rule that caught it. Include that.

YouTube changes its markup often. "Beej stopped hiding X" is usually a selector in
`src/content/extract.js` that no longer matches, and a saved copy of the page's HTML
around the broken element makes it much quicker to fix.

## Setting up

There is no build step and the extension has no dependencies.

1. Clone the repo.
2. Open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked** and pick
   the repo folder.
3. After editing, click the reload icon on Beej's card in `chrome://extensions`. Open
   YouTube tabs pick up the new code without reloading.

You need Node 20+ for the tests, and Python 3 for the packaging and preflight scripts.

## Before you open a pull request

```bash
sh tools/test/run.sh         # every suite must pass
python tools/preflight.py    # catches what Chrome would refuse to load
```

Then try the change on real YouTube, in the modes it affects. Most bugs here only show up
against the live DOM.

If a change affects anything shown in the user guide, regenerate the images:

```bash
npm install
npx playwright install chromium
npm run screenshots
```

## Rules the code relies on

- **Source files are pure ASCII.** Write non-ASCII as `\uXXXX`. Chrome refused to load a
  content script over a stray character once; the README explains how.
  `tools/preflight.py` checks this.
- **YouTube's DOM selectors live only in `src/content/extract.js`,** and the About-page
  JSON marker only in `util.js`. Keep it that way, so a YouTube change means fixing one
  file.
- **No new network requests.** Beej talks only to YouTube's own pages and, if the user
  supplies a key, the YouTube Data API. Anything else changes the privacy policy
  ([`PRIVACY.md`](PRIVACY.md)) and the store listing, so raise it in an issue first.
- **No new permissions** without discussing it in an issue first. Every permission has to
  be justified to the Chrome Web Store.
- **When unsure, show the video** in block mode, and hide it in only mode. A missed block
  costs less than hiding something the user wanted.
- **Match the surrounding code.** Classic scripts (no `import`), `var` and plain functions
  in the extension, and comments that say why rather than what.
- **Tests run the shipped functions,** not copies of them. A new suite goes in
  `tools/test/test_<name>.js` and is picked up by `run.sh` automatically.

## Working on the parental lock

Activating the lock needs a licence key, and keys are signed with a private key only the
maintainer holds. To test locally, make your own key pair:

```bash
node tools/licence.js init
node tools/licence.js issue you@example.com
```

`init` writes a new public key into `src/shared/licence.js`. **Do not commit that change.**
Run `git checkout src/shared/licence.js` before you commit, or your pull request would
stop every real key from working.

## Pull requests

- Keep a pull request to one change, and say in the description what it fixes and how
  you checked it.
- Leave the `version` in `manifest.json` alone. It is bumped when a release goes to the
  store.
- By contributing, you agree your work is released under the [MIT licence](LICENSE).
