#!/usr/bin/env node
/* Screenshots for the user guide in docs/images/, plus the store's
   store/screenshot-4-channels.png.

     npm install && npx playwright install chromium
     npm run screenshots

   Loads the unpacked extension into a throwaway Chromium profile, so no
   personal feed, history or channel cache ends up in a picture, and walks the
   real options page through each state the guide describes.

   The parental-lock shots need a genuine licence key. Set BEEJ_DEMO_KEY to
   one, or keep the signing key in private/ and one is issued for
   parent@example.com. Without either, those shots are skipped. */

const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'images');
const VIEWPORT = { width: 1280, height: 800 };
const PIN = '2468';

const RULES = {
  mode: 'block',
  countries: ['US', 'GB'],
  languages: ['es', 'pt'],
  blocklist: ['@youtube'],   // stored lowercased, as the options page saves them
  allowlist: ['@veritasium']
};

function demoKey() {
  if (process.env.BEEJ_DEMO_KEY) return process.env.BEEJ_DEMO_KEY.trim();
  if (!fs.existsSync(path.join(ROOT, 'private', 'licence-signing-key.pem'))) return null;
  return execFileSync(process.execPath,
    [path.join(ROOT, 'tools', 'licence.js'), 'issue', 'parent@example.com'],
    { encoding: 'utf8' }).trim();
}

async function shoot(target, name, dir) {
  const file = path.join(dir || OUT, name + '.png');
  await target.screenshot({ path: file, animations: 'disabled' });
  console.log('wrote', path.relative(ROOT, file));
}

async function openOptions(context, id) {
  const page = await context.newPage();
  await page.setViewportSize(VIEWPORT);
  await page.goto('chrome-extension://' + id + '/src/options/options.html');
  await page.waitForSelector('body:not(.booting)');
  return page;
}

/* The store's "Channels Beej has seen" shot. The table is filled by real
   lookups, from browsing a few searches with the country rules on, so every
   channel and country in it is what YouTube actually reports. The page is
   zoomed to 125% to match the other store shots at 1280x800. */
const SEARCHES = ['science documentary', 'street food', 'travel vlog', 'piano tutorial'];

async function shootChannelTable(context, id) {
  const yt = await context.newPage();
  for (const q of SEARCHES) {
    await yt.goto('https://www.youtube.com/results?search_query=' + encodeURIComponent(q));
    await yt.waitForTimeout(4000);
    await yt.mouse.wheel(0, 3000);
    await yt.waitForTimeout(4000);
  }
  await yt.close();

  const page = await openOptions(context, id);
  await page.waitForFunction(() => /channels? known/.test(
    document.getElementById('channel-summary').textContent), null, { timeout: 30000 });
  await page.evaluate(() => {
    document.body.style.zoom = '1.25';
    document.getElementById('channel-table').closest('.card').scrollIntoView();
  });
  await page.waitForTimeout(500);
  await shoot(page, 'screenshot-4-channels', path.join(ROOT, 'store'));
  await page.close();
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'beej-shots-'));

  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium',
    headless: process.env.HEADED ? false : true,
    viewport: VIEWPORT,
    locale: 'en-GB',
    args: ['--disable-extensions-except=' + ROOT, '--load-extension=' + ROOT]
  });

  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;

    let page = await openOptions(context, id);
    await page.evaluate((rules) => new Promise((r) => chrome.storage.sync.set(rules, r)), RULES);
    await page.reload();
    await page.waitForSelector('body:not(.booting)');
    await shoot(page, 'options-overview');

    const card = page.locator('#lock-card');
    await shoot(card, 'lock-pro');

    await shootChannelTable(context, id);

    const key = demoKey();
    if (!key) {
      console.log('no licence key: skipping the parental lock shots');
      return;
    }

    await page.fill('#licence-key', key);
    await page.click('#licence-activate');
    await page.waitForSelector('#lock-setup:not([hidden])');
    await page.fill('#pin-new', PIN);
    await page.fill('#pin-confirm', PIN);
    await shoot(card, 'lock-setup');

    await page.click('#pin-set');
    await page.waitForSelector('#lock-recovery:not([hidden])');
    await shoot(card, 'lock-recovery');

    await page.click('#recovery-done');
    await page.waitForSelector('#lock-on:not([hidden])');
    await shoot(card, 'lock-on');

    await page.close();
    page = await openOptions(context, id);
    await page.waitForSelector('#gate:not([hidden])');
    await shoot(page, 'lock-gate');

    // A blocked channel's video while the lock is on: the card offers
    // "Go back" and nothing else.
    const yt = await context.newPage();
    await yt.goto('https://www.youtube.com/@YouTube/videos');
    await yt.waitForSelector('#beej-block-card', { timeout: 30000 });
    await yt.waitForTimeout(1500);
    await shoot(yt, 'block-channel-locked');

    const href = await yt.locator('a[href^="/watch"]').first()
      .getAttribute('href', { timeout: 30000 });
    await yt.goto('https://www.youtube.com' + href.split('&')[0]);
    await yt.waitForSelector('#beej-block-card', { timeout: 30000 });
    await yt.waitForTimeout(1500);
    await shoot(yt, 'block-watch-locked');
  } finally {
    await context.close();
    fs.rmSync(profile, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
