// Render the same moments of one film in several styles and tile them into one labelled sheet: one row per style, one
// column per moment. Use it to let the user choose a style on their own content, and to check a style change.
//   node styleboard.mjs --film film.html --timeline timeline.json --at 2.4,9.5,30 [--styles nebula,swiss] [--cell 480]
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { arg, contactSheet, launch, listStyles, normalizeTimeline, openFilm, readJson } from './lib.mjs';

const film = resolve(arg('film', 'film.html'));
const base = normalizeTimeline(readJson(resolve(arg('timeline', 'timeline.json'))));
const times = String(arg('at', `${(base.total * .15).toFixed(1)},${(base.total * .5).toFixed(1)},${(base.total * .85).toFixed(1)}`)).split(',').map(Number);
const all = listStyles(dirname(film));
const pick = typeof arg('styles') === 'string' ? arg('styles').split(',') : all.map((s) => s.slug);
const styles = pick.map((slug) => all.find((s) => s.slug === slug) ?? (() => { throw new Error(`no styles/${slug}/ next to ${film}`); })());
const cell = Number(arg('cell', 480));
const dir = join(dirname(film), 'preview');
mkdirSync(dir, { recursive: true });

const browser = await launch();
const files = [];
let failed = 0;
for (const s of styles) {
  const errors = [];
  const page = await openFilm(browser, film, { ...base, style: s.slug }, errors);
  for (const t of times) {
    await page.evaluate((x) => window.render(x), t);
    await page.evaluate(({ label, t }) => {
      let tag = document.getElementById('__styleboard');
      if (!tag) { tag = document.createElement('div'); tag.id = '__styleboard'; document.body.append(tag); }
      tag.textContent = `${label}  ·  ${t.toFixed(1)} s`;
      tag.style.cssText = 'position:fixed;left:24px;top:20px;z-index:99999;padding:8px 18px;font:600 30px/1.2 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#fff;background:rgba(0,0,0,.72);border-radius:10px;text-shadow:none;filter:none;opacity:1;clip-path:none';
    }, { label: `${s.slug}${s.cn ? ` ${s.cn}` : ''}`, t });
    const f = join(dir, `sb-${s.slug}-${String(t).replace('.', '_')}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  }
  if (errors.length) { failed += 1; console.error(`${s.slug}: ${errors.length} page error(s)`); }
  await page.close();
}
await browser.close();
for (const f of readdirSync(dir)) if (/^styleboard-.*\.jpg$/.test(f)) unlinkSync(join(dir, f));
const tag = Date.now().toString(36);
const rows = Math.min(styles.length, Math.max(1, Math.floor(4000 / (cell * 9 / 16))));
contactSheet(files, join(dir, `styleboard-${tag}-%d.jpg`), { cols: times.length, rows, cell });
for (const f of files) unlinkSync(f);
const sheets = readdirSync(dir).filter((f) => f.startsWith(`styleboard-${tag}`)).map((f) => join(dir, f));
console.log(`styleboard: ${styles.length} styles x ${times.length} moments\n  ${sheets.join('\n  ')}`);
process.exit(failed ? 1 : 0);
