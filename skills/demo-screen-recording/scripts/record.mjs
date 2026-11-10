// Scenario-driven demo recorder (Playwright recordVideo).
// Usage: node record.mjs <scenario.mjs> [out.webm | out.mp4]
// A scenario module exports `config` ({ url, name, viewport, timeoutMin, channel, headless, locale, storageState,
// waitUntil, contextOptions }) and a default async function (ctx) that drives the page using the helpers below.
// An .mp4 output keeps the .webm next to it and converts it with a full ffmpeg (FFMPEG, the promo tools, or PATH).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const WIN = process.platform === 'win32';

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
  const tries = [process.env.PLAYWRIGHT_CORE && path.join(process.env.PLAYWRIGHT_CORE, 'package.json'),
    path.join(here, '..', 'package.json'), path.join(promoTools(), 'package.json'), path.join(process.cwd(), 'package.json')].filter(Boolean);
  for (const base of tries) { try { return createRequire(base)('playwright-core'); } catch {} }
  console.error('playwright-core not found. Run product-promo-video setup.mjs (shared ~/.promo-tools), `npm install` in this skill folder, or set PLAYWRIGHT_CORE.');
  process.exit(2);
}

function fullFfmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const venv = path.join(promoTools(), 'venv');
  const libs = WIN ? [path.join(venv, 'Lib', 'site-packages')]
    : fs.existsSync(path.join(venv, 'lib')) ? fs.readdirSync(path.join(venv, 'lib')).map((d) => path.join(venv, 'lib', d, 'site-packages')) : [];
  for (const lib of libs) {
    const dir = path.join(lib, 'imageio_ffmpeg', 'binaries');
    const bin = fs.existsSync(dir) && fs.readdirSync(dir).find((f) => f.startsWith('ffmpeg'));
    if (bin) return path.join(dir, bin);
  }
  const r = spawnSync('ffmpeg', ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  return r.status === 0 && /libx264/.test(r.stdout) ? 'ffmpeg' : null;
}

const scenarioPath = process.argv[2];
if (!scenarioPath) { console.error('usage: node record.mjs <scenario.mjs> [out.webm | out.mp4]'); process.exit(2); }
const scenario = await import(pathToFileURL(path.resolve(scenarioPath)).href);
const cfg = { viewport: { width: 1600, height: 900 }, timeoutMin: 25, channel: 'msedge', headless: true, name: 'demo', locale: 'zh-CN', waitUntil: 'load', ...scenario.config };
const requested = path.resolve(process.argv[3] || path.join(process.cwd(), `${cfg.name}.webm`));
const mp4 = /\.mp4$/i.test(requested) ? requested : null;
const outFile = mp4 ? requested.replace(/\.mp4$/i, '.webm') : requested;
const outDir = path.dirname(outFile);
const shotDir = path.join(outDir, `${cfg.name}-shots`);
const rawDir = path.join(outDir, `.${cfg.name}-raw`);

const existing = [outFile, mp4, shotDir, rawDir].filter(Boolean).filter((p) => {
  try { fs.lstatSync(p); return true; } catch (e) { if (e.code === 'ENOENT') return false; throw e; }
});
if (existing.length) {
  console.error(`refusing to overwrite existing recording output:\n${existing.map((p) => `  ${p}`).join('\n')}\nChoose a new output name or move the existing files.`);
  process.exit(2);
}
const ffmpegBin = mp4 ? fullFfmpeg() : null;
if (mp4 && !ffmpegBin) {
  console.error('an .mp4 output needs a full ffmpeg (libx264): set FFMPEG, run product-promo-video setup.mjs, or record .webm.');
  process.exit(2);
}

const { chromium } = loadPlaywright();
const t0 = Date.now();
const log = (...a) => console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`, ...a);
// Nothing is written until the browser is up, so a failed launch leaves nothing that blocks the next run.
const browser = await chromium.launch({ channel: cfg.channel, headless: cfg.headless });
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(shotDir, { recursive: true });
fs.mkdirSync(rawDir);
let context;
try {
  context = await browser.newContext({
    viewport: cfg.viewport, locale: cfg.locale, recordVideo: { dir: rawDir, size: cfg.viewport },
    ...(cfg.storageState ? { storageState: path.resolve(cfg.storageState) } : {}),
    ...cfg.contextOptions,
  });
} catch (e) {
  await browser.close();
  fs.rmSync(shotDir, { recursive: true, force: true });
  fs.rmSync(rawDir, { recursive: true, force: true });
  throw e;
}
const page = await context.newPage();
const deadline = Date.now() + cfg.timeoutMin * 60_000;

let n = 0;
const h = {
  page, log, deadline, config: cfg,
  wait: (ms) => page.waitForTimeout(ms),
  shot: (tag) => page.screenshot({ path: path.join(shotDir, `${String(++n).padStart(2, '0')}-${tag}.png`) }),
  // Body text with digits stripped, so running timers don't count as progress.
  signature: async () => (await page.locator('body').innerText()).replace(/\d+/g, ''),
  bodyText: () => page.locator('body').innerText(),
  // Hover before clicking so the viewer sees where the action happens.
  async click(locator, pause = 900) { await locator.scrollIntoViewIfNeeded().catch(() => {}); await locator.hover().catch(() => {}); await h.wait(pause); await locator.click(); },
  async type(locator, text, delay = 60) { await locator.click(); await locator.pressSequentially(text, { delay }); },
  async scroll(locator, steps = 6, dy = 500) { for (let i = 0; i < steps; i++) { await locator.hover().catch(() => {}); await page.mouse.wheel(0, dy); await h.wait(1500); } },
  async waitText(re, timeoutMs = 120_000) {
    const end = Math.min(deadline, Date.now() + timeoutMs);
    while (Date.now() < end) { if (re.test(await h.bodyText())) return true; await h.wait(1000); }
    return false;
  },
  // Wait for the UI to stop changing.
  async settle(quietMs = 12_000, maxMs = 120_000) {
    const end = Math.min(deadline, Date.now() + maxMs); let prev = '', quiet = Date.now();
    while (Date.now() < end && Date.now() - quiet < quietMs) { await h.wait(1500); const s = await h.signature(); if (s !== prev) { prev = s; quiet = Date.now(); } }
  },
  /**
   * Agent-driven flow loop: clicks approval buttons as they appear, runs hooks,
   * nudges an idle agent, and stops when `done` matches or nothing changes for `stallMs`.
   * opts: { approve: RegExp (exact button label), hasText: RegExp, done: RegExp,
   *         onTick?: async (body, state) => void, nudge?: { box, text, max, idleMs, busy: RegExp }, stallMs }
   */
  async drive(opts) {
    const state = { approvals: 0, nudges: 0, done: false };
    let last = '', changed = Date.now();
    const stallMs = opts.stallMs ?? 300_000;
    while (Date.now() < deadline) {
      await h.wait(1500);
      for (const btn of await page.locator('button', { hasText: opts.hasText }).all()) {
        const label = (await btn.innerText().catch(() => '')).trim();
        if (opts.approve.test(label) && await btn.isVisible() && await btn.isEnabled()) {
          await h.click(btn, 1500); state.approvals++; log('clicked', label); await h.shot('approve' + state.approvals); await h.wait(1500);
          break;
        }
      }
      const body = await h.bodyText();
      const sig = body.replace(/\d+/g, '');
      if (sig !== last) { last = sig; changed = Date.now(); }
      if (opts.onTick) await opts.onTick(body, state);
      if (opts.done.test(body)) { state.done = true; log('done'); break; }
      const nd = opts.nudge;
      if (nd && state.nudges < (nd.max ?? 2) && state.approvals >= (nd.minApprovals ?? 0) && Date.now() - changed > (nd.idleMs ?? 20_000) && !(nd.busy?.test(body))
          && !(nd.skip && await nd.skip(body, state))) {
        state.nudges++; await h.type(nd.box(), nd.text); await h.wait(600); await nd.box().press('Enter'); log('nudge'); changed = Date.now();
      }
      if (Date.now() - changed > stallMs) { log('stalled'); break; }
    }
    if (!state.done && Date.now() >= deadline) log(`timeoutMin ${cfg.timeoutMin} reached`);
    return state;
  },
};

let ok = true;
try {
  // Not 'networkidle': chat and agent apps keep a stream or poll open, so the network never goes quiet.
  await page.goto(cfg.url, { waitUntil: cfg.waitUntil });
  await h.wait(1500);
  ok = (await scenario.default(h)) !== false;
} catch (e) {
  ok = false; console.error(e); await h.shot('error').catch(() => {});
}
const raw = await page.video().path();
await context.close(); await browser.close();
fs.copyFileSync(raw, outFile, fs.constants.COPYFILE_EXCL);
fs.rmSync(rawDir, { recursive: true, force: true });
let video = outFile;
if (mp4) {
  const r = spawnSync(ffmpegBin, ['-hide_banner', '-loglevel', 'error', '-n', '-i', outFile, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', '-movflags', '+faststart', mp4], { encoding: 'utf8' });
  if (r.status === 0) video = mp4;
  else { ok = false; console.error(`mp4 conversion failed, the webm is kept: ${r.stderr || r.error?.message}`); }
}
log(`${ok ? 'OK' : 'INCOMPLETE'} video=${video} shots=${shotDir} size=${(fs.statSync(video).size / 1048576).toFixed(1)}MB`);
process.exitCode = ok ? 0 : 1;
