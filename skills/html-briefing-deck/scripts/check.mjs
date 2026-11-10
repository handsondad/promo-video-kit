// Screenshot every slide of an HTML deck and report layout problems.
// Usage: node check.mjs <deck.html> [outDir]      SLIDES=3,7 checks only those slides; PW_CHANNEL=msedge|chrome|chromium
// Screenshots get a fresh name each run (s03-<run>.png) and the previous run's are removed: image viewers cache by
// path, and a stale picture looks like a fix that did nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

// The shared tools dir of product-promo-video: $PROMO_TOOLS, the nearest .promo-tools upwards, ~/.promo-tools.
function promoTools() {
  if (process.env.PROMO_TOOLS) return path.resolve(process.env.PROMO_TOOLS);
  for (let dir = process.cwd(); ; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.promo-tools', 'package.json'))) return path.join(dir, '.promo-tools');
    if (path.dirname(dir) === dir) break;
  }
  return path.join(os.homedir(), '.promo-tools');
}

function loadPlaywright() {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const tries = [process.env.PLAYWRIGHT_CORE && path.join(process.env.PLAYWRIGHT_CORE, 'package.json'),
    path.join(here, '..', 'package.json'), path.join(promoTools(), 'package.json'), path.join(process.cwd(), 'package.json')].filter(Boolean);
  for (const base of tries) {
    try { return createRequire(base)('playwright-core'); } catch {}
  }
  console.error('playwright-core not found. Run product-promo-video setup.mjs (shared ~/.promo-tools), `npm install` in this skill folder, or set PLAYWRIGHT_CORE.');
  process.exit(2);
}

const deck = process.argv[2];
if (!deck) { console.error('usage: node check.mjs <deck.html> [outDir]'); process.exit(2); }
const out = path.resolve(process.argv[3] || path.join(path.dirname(deck), 'deck-shots'));
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^s\d+(-[a-z0-9]+)?\.png$/.test(f)) fs.unlinkSync(path.join(out, f));
const run = Date.now().toString(36);

const { chromium } = loadPlaywright();
const channel = process.env.PW_CHANNEL || (process.platform === 'win32' ? 'msedge' : 'chrome');
const browser = await chromium.launch(channel === 'chromium' ? {} : { channel });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(pathToFileURL(path.resolve(deck)).href + '#1');
await page.waitForTimeout(800);
const total = await page.evaluate(() => document.querySelectorAll('.slide').length);
if (!total || !(await page.evaluate(() => typeof go === 'function'))) {
  await browser.close();
  console.error(`${deck}: no .slide sections or no go(i) function; build the deck from assets/template.html`);
  process.exit(2);
}
const only = process.env.SLIDES ? new Set(process.env.SLIDES.split(',').map(Number)) : null;
const issues = [], shots = [];

for (let i = 0; i < total; i++) {
  if (only && !only.has(i + 1)) continue;
  await page.evaluate((n) => go(n), i);
  await page.waitForTimeout(1900);
  const shot = path.join(out, `s${String(i + 1).padStart(2, '0')}-${run}.png`);
  await page.screenshot({ path: shot });
  shots.push(shot);
  const found = await page.evaluate(() => {
    const s = document.querySelector('.slide.active'); const sb = s.getBoundingClientRect(); const r = [];
    const name = (e) => e.tagName.toLowerCase() + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).join('.') : '');
    s.querySelectorAll('*').forEach((e) => {
      if (e.closest('svg') && e.tagName !== 'svg') {
        const da = e.getAttribute('stroke-dasharray') || getComputedStyle(e).strokeDasharray;
        if (da && da !== 'none' && da !== '0') r.push('dashed svg ' + name(e));
        return;
      }
      const b = e.getBoundingClientRect(); if (!b.width) return;
      const cs = getComputedStyle(e);
      if (b.bottom > sb.bottom - 36 && !e.matches('.brand,.page')) r.push(`overflow-bottom ${name(e)} bottom=${Math.round(b.bottom - sb.top)}`);
      if (b.right > sb.right - 40 && !e.matches('.page')) r.push(`overflow-right ${name(e)}`);
      if (e.scrollWidth > e.clientWidth + 2 && cs.overflow !== 'visible' && e !== s) r.push('hscroll ' + name(e));
      for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
        if (/dashed|dotted/.test(cs['border' + side + 'Style'])) { r.push('dashed border ' + name(e)); break; }
      }
      // A short heading that wraps into a tall narrow column reads as vertical text.
      if (/^H[1-4]$/.test(e.tagName) && e.textContent.trim().length <= 8 && b.height > parseFloat(cs.lineHeight || cs.fontSize) * 2.2 && b.width < parseFloat(cs.fontSize) * 3)
        r.push('vertical-text ' + name(e));
      // Body copy (paragraphs, list items, table cells) under 15px is unreadable when projected.
      if (/^(P|LI|TD)$/.test(e.tagName) && e.textContent.trim() && parseFloat(cs.fontSize) < 15)
        r.push(`small-text ${name(e)} ${parseFloat(cs.fontSize)}px`);
    });
    return [...new Set(r)].slice(0, 6);
  });
  if (found.length) issues.push(`${i + 1}: ${found.join(' | ')}`);
}
await browser.close();
console.log(`slides=${total} checked=${shots.length}\n${shots.map((f) => `  ${f}`).join('\n')}`);
console.log(issues.length ? issues.join('\n') : 'no issues');
process.exitCode = issues.length ? 1 : 0;
