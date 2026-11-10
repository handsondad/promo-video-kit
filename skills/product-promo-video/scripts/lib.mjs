// Shared tool resolution for the promo scripts: tools dir, playwright-core, a full ffmpeg (with libx264 + aac), python.
import { createRequire } from 'node:module';
import { existsSync, readFileSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WIN = process.platform === 'win32';
export const SKILL = dirname(dirname(fileURLToPath(import.meta.url)));
export const VERSION = readFileSync(join(SKILL, 'VERSION'), 'utf8').trim();
// $PROMO_TOOLS, else the nearest .promo-tools in this or a parent directory, else ~/.promo-tools (setup's default).
export const TOOLS = (() => {
  if (process.env.PROMO_TOOLS) return resolve(process.env.PROMO_TOOLS);
  for (let dir = process.cwd(); ; dir = dirname(dir)) {
    if (existsSync(join(dir, '.promo-tools', 'package.json'))) return join(dir, '.promo-tools');
    if (dirname(dir) === dir) break;
  }
  return join(homedir(), '.promo-tools');
})();

export function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = process.argv[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
}

// Windows editors and PowerShell 5 may save JSON with a byte-order mark.
export const readJson = (p) => JSON.parse(readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));

// The skills shipped together with this one: every skills/<name>/ with a SKILL.md when this copy sits in the kit (the
// repo, whose package.json is promo-video-kit, or an offline bundle with bundle.json); otherwise just this skill.
export function kitSkills() {
  const parent = dirname(SKILL), root = dirname(parent);
  let kit = existsSync(join(root, 'bundle.json'));
  try { kit ||= readJson(join(root, 'package.json')).name === 'promo-video-kit'; } catch { /* not the repo */ }
  if (!kit || basename(parent) !== 'skills') return [SKILL];
  return readdirSync(parent).map((d) => join(parent, d)).filter((d) => existsSync(join(d, 'SKILL.md')));
}

// The playwright-core version setup.mjs installs, and the one in the tools dir (null when absent).
export const PINNED = readJson(join(SKILL, 'deps', 'package.json')).dependencies['playwright-core'];
export function installedPlaywright() {
  const p = join(TOOLS, 'node_modules', 'playwright-core', 'package.json');
  return existsSync(p) ? readJson(p).version : null;
}

export function python() {
  const venv = join(TOOLS, 'venv', WIN ? 'Scripts/python.exe' : 'bin/python');
  return existsSync(venv) ? venv : null;
}

export function hasEncoders(bin) {
  const r = spawnSync(bin, ['-hide_banner', '-encoders'], { encoding: 'utf8' });
  return r.status === 0 && /libx264/.test(r.stdout) && /\baac\b/.test(r.stdout);
}

export function ffmpeg() {
  if (process.env.FFMPEG) return process.env.FFMPEG;
  const lib = join(TOOLS, 'venv/lib');
  const libs = WIN ? [join(TOOLS, 'venv/Lib/site-packages')]
    : existsSync(lib) ? readdirSync(lib).map((d) => join(lib, d, 'site-packages')) : [];
  for (const lib of libs) {
    const dir = join(lib, 'imageio_ffmpeg/binaries');
    if (!existsSync(dir)) continue;
    const bin = readdirSync(dir).find((f) => f.startsWith('ffmpeg'));
    if (bin) return join(dir, bin);
  }
  if (hasEncoders('ffmpeg')) return 'ffmpeg';
  throw new Error('No full ffmpeg (libx264 + aac). Run scripts/setup.mjs, or set FFMPEG to one. Playwright\'s bundled ffmpeg only encodes VP8 video and cannot be used.');
}

export function chromium() {
  for (const base of [TOOLS, process.cwd()]) {
    try { return createRequire(join(base, 'package.json'))('playwright-core').chromium; } catch { /* next */ }
  }
  throw new Error(`playwright-core not found in ${TOOLS} or the current directory. Run scripts/setup.mjs.`);
}

// Installed Edge/Chrome first (no browser download); PROMO_BROWSER=msedge|chrome|chromium overrides.
export async function launch() {
  const c = chromium();
  const wanted = process.env.PROMO_BROWSER;
  const order = wanted ? [wanted] : WIN ? ['msedge', 'chrome', 'chromium'] : ['chrome', 'msedge', 'chromium'];
  let last;
  for (const channel of order) {
    try {
      const browser = await c.launch({ headless: true, ...(channel === 'chromium' ? {} : { channel }) });
      return Object.assign(browser, { channel });
    } catch (e) { last = e; }
  }
  throw last;
}

export function run(bin, args, opts = {}) {
  const r = spawnSync(bin, args, { encoding: 'utf8', maxBuffer: 1 << 28, ...opts });
  if (r.error) throw r.error;
  return r;
}

export function duration(file) {
  const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(run(ffmpeg(), ['-hide_banner', '-i', file]).stderr);
  if (!m) throw new Error(`no duration for ${file}`);
  return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

// Scenes may omit start (cumulative) and the timeline may omit total. --style <slug> and --size WxH override the file.
export function normalizeTimeline(tl) {
  let at = 0;
  const scenes = tl.scenes.map((s) => { const start = s.start ?? at; at = start + s.dur; return { ...s, start }; });
  const out = { fps: 30, width: 1920, height: 1080, ...tl, scenes, total: tl.total ?? at };
  const style = arg('style'), size = arg('size');
  if (typeof style === 'string') out.style = style;
  if (typeof size === 'string') { const m = /^(\d+)x(\d+)$/.exec(size); if (!m) throw new Error(`--size ${size}: expected WxH`); out.width = Number(m[1]); out.height = Number(m[2]); }
  return out;
}

// Open a film page with TIMELINE injected; fails if the page doesn't define window.render. Page errors go to `errors`.
export async function openFilm(browser, film, timeline, errors = []) {
  const { pathToFileURL } = await import('node:url');
  const page = await browser.newPage({ viewport: { width: timeline.width, height: timeline.height }, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => { errors.push(e.message); console.error('page error:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { errors.push(m.text()); console.error('console:', m.text()); } });
  await page.addInitScript((tl) => { window.TIMELINE = tl; }, timeline);
  await page.goto(pathToFileURL(film).href);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
  if (!(await page.evaluate(() => typeof window.render === 'function'))) throw new Error(`${film} does not define window.render(t)`);
  return page;
}

// Styles available to a film: <film dir>/styles/<slug>/style.json, read with their names.
export function listStyles(dir) {
  const root = join(dir, 'styles');
  if (!existsSync(root)) return [];
  return readdirSync(root).filter((d) => !d.startsWith('_') && existsSync(join(root, d, 'style.js'))).map((slug) => {
    let meta = {};
    try { meta = readJson(join(root, slug, 'style.json')); } catch { /* no metadata */ }
    return { slug, ...meta };
  });
}

// Tile PNG/JPEG files into contact sheets (cols×rows, each cell `cell` px wide).
export function contactSheet(files, outPattern, { cols = 3, rows = 3, cell = 640 } = {}) {
  const list = files.map((f) => `file '${resolve(f).replace(/\\/g, '/').replace(/'/g, "'\\''")}'\nduration 1`).join('\n');
  const listFile = `${outPattern}.txt`;
  writeFileSync(listFile, `${list}\n`);
  const r = run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-vf', `scale=${cell}:-1,tile=${cols}x${rows}`, '-fps_mode', 'passthrough', outPattern]);
  unlinkSync(listFile);
  if (r.status !== 0) throw new Error(`contact sheet: ${r.stderr}`);
}
