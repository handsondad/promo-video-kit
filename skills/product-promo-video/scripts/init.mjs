// Set up a film folder: the kit, one starter template, and the styles it can switch between.
//   node init.mjs --dir .promo/film --cut motion|narrated|patterns [--style keynote] [--all-styles] [--brand] [--force]
// --brand adds brand.css (the brand's own colours and fonts, loaded after the style) and sets "brand" in the timeline.
// Or start a style of your own in $PROMO_STYLES (default ~/.promo-styles/<slug>/), from the blank template or a copy:
//   node init.mjs --new-style night-lab [--name 夜间实验室] [--from keynote]
// Styles come from this skill's styles/ and from your own styles, which win on a name clash. The chosen style is
// written into timeline.json / script.json ("style"), and its sound palette into cues.json ("palette"). Running it again
// refreshes the kit and every style already in the folder; templates and your own files stay unless --force.
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arg, readJson } from './lib.mjs';

const SKILL = dirname(dirname(fileURLToPath(import.meta.url)));
const MINE = resolve(process.env.PROMO_STYLES ?? join(homedir(), '.promo-styles'));

const sources = new Map();
for (const root of [join(SKILL, 'styles'), MINE]) {
  if (!existsSync(root)) continue;
  for (const d of readdirSync(root)) if (!d.startsWith('_') && existsSync(join(root, d, 'style.js'))) sources.set(d, join(root, d));
}
const meta = (dir) => { try { return readJson(join(dir, 'style.json')); } catch { return {}; } };

const fresh = arg('new-style');
if (fresh) {
  if (fresh === true || !/^[a-z][a-z0-9-]{1,30}$/.test(fresh)) throw new Error('--new-style <slug>: lower-case letters, digits and dashes');
  const from = arg('from', '_template'), name = arg('name', fresh);
  const src = from === '_template' ? join(SKILL, 'styles', '_template') : sources.get(from);
  if (!src) throw new Error(`--from ${from}: not found. Available: _template, ${[...sources.keys()].join(', ')}`);
  const target = join(MINE, fresh);
  if (existsSync(target) && arg('force') !== true) throw new Error(`${target} exists (use --force to overwrite)`);
  mkdirSync(target, { recursive: true });
  cpSync(src, target, { recursive: true });
  const old = from === '_template' ? '__slug__' : from, oldName = from === '_template' ? '__name__' : meta(src).cn;
  for (const f of ['theme.css', 'style.js', 'style.json', 'STYLE.md']) {
    const p = join(target, f);
    if (!existsSync(p)) continue;
    let s = readFileSync(p, 'utf8').replaceAll(old, fresh);
    if (oldName) s = s.replaceAll(oldName, name);
    writeFileSync(p, s);
  }
  const json = { ...meta(target), slug: fresh, cn: name, basedOn: from === '_template' ? undefined : from };
  writeFileSync(join(target, 'style.json'), `${JSON.stringify(json, null, 2)}\n`);
  const index = join(MINE, 'README.md');
  const rows = readdirSync(MINE).filter((d) => existsSync(join(MINE, d, 'style.js'))).map((d) => {
    const m = meta(join(MINE, d));
    return `| \`${d}\` | ${m.cn ?? ''} | ${m.basedOn ?? '—'} | ${m.sound ?? ''} | ${(m.line ?? '').replaceAll('|', '/')} |`;
  });
  writeFileSync(index, `# 我的视频风格\n\n由 product-promo-video 的 \`init.mjs --new-style\` 维护；用 \`init.mjs --style <slug>\` 在片子里使用。\n\n| slug | 名称 | 基于 | 声音 | 一句话 |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
  console.log(`new style ${fresh} (${name}) from ${from}\n  folder ${target}\n  next: edit theme.css → style.js → STYLE.md, then compare with styleboard.mjs`);
  process.exit(0);
}

const dir = resolve(arg('dir', '.promo/film'));
const cut = arg('cut', 'motion');
const recorded = ['timeline.json', 'script.json', 'patterns.timeline.json'].map((f) => join(dir, f)).filter(existsSync)
  .map((p) => { try { return readJson(p).style; } catch { return undefined; } }).find(Boolean);
const style = arg('style', recorded ?? 'nebula');
const force = arg('force') === true;
const CUTS = {
  motion: [['motion.html', 'film.html'], ['motion.timeline.json', 'timeline.json'], ['motion.cues.json', 'cues.json']],
  narrated: [['narrated.html', 'film.html'], ['narrated.script.json', 'script.json']],
  patterns: [['patterns.html', 'patterns.html'], ['patterns.timeline.json', 'patterns.timeline.json']],
};
if (!CUTS[cut]) throw new Error(`--cut ${cut}: expected ${Object.keys(CUTS).join(' | ')}`);
if (!sources.has(style)) throw new Error(`style "${style}" not found. Available: ${[...sources.keys()].join(', ')}`);

mkdirSync(dir, { recursive: true });
const copied = [];
const put = (from, to, always = false) => {
  const target = join(dir, to);
  if (existsSync(target) && !force && !always) return;
  cpSync(from, target, { recursive: true });
  copied.push(to);
};
put(join(SKILL, 'templates', 'kit.js'), 'kit.js', true);
put(join(SKILL, 'templates', 'kit.css'), 'kit.css', true);
for (const [from, to] of CUTS[cut]) put(join(SKILL, 'templates', from), to);
const present = existsSync(join(dir, 'styles')) ? readdirSync(join(dir, 'styles')).filter((d) => sources.has(d)) : [];
const wanted = arg('all-styles') === true ? [...sources.keys()] : [...new Set([style, 'nebula', ...present])];
for (const slug of wanted) put(sources.get(slug), join('styles', slug), true);
const brand = arg('brand') === true;
if (brand) put(join(SKILL, 'templates', 'brand.css'), 'brand.css');

const sound = meta(sources.get(style)).sound;
for (const f of ['timeline.json', 'script.json', 'patterns.timeline.json', 'cues.json']) {
  const p = join(dir, f);
  if (!existsSync(p) || !CUTS[cut].some(([, to]) => to === f)) continue;
  const json = readJson(p);
  if (f === 'cues.json') { if (sound) json.palette = sound; } else { json.style = style; if (brand) json.brand = 'brand.css'; }
  writeFileSync(p, `${JSON.stringify(json, null, 2)}\n`);
}
console.log(`film folder ${dir}\n  cut ${cut}, style ${style}${sources.get(style).startsWith(MINE) ? ' (your own)' : ''}${sound ? `, sound palette ${sound}` : ''}\n  copied: ${copied.join(', ') || 'nothing new (use --force to overwrite)'}`);
console.log(`  styles here: ${readdirSync(join(dir, 'styles')).join(', ')}`);
