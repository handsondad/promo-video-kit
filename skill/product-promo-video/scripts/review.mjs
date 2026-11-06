// Review sheets: the frames a reviewer reads instead of watching, each labelled with its scene and time.
//   node review.mjs --film film.html --timeline timeline.json [--out review] [--check check.json] [--style s] [--size WxH]
// Writes into <out>/ (default review/ next to the film):
//   beats-*.jpg  each scene just after it starts, at its middle, and after its impact; three a row
//   cuts-*.jpg   one row per cut, at -0.2, -0.1, 0, +0.1 and +0.2 s around it: does the motion carry across?
//   phone-*.jpg  the beat frames 360 px wide, the size a phone shows them: can it still be read?
//   REVIEW.md    the note to fill in (kept if it already exists): what a stranger sees at each beat, then the fixes
//                ranked P0 / P1 / P2, then the delivery note. --check adds the warnings from check.mjs --json.
import { existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { arg, contactSheet, launch, normalizeTimeline, openFilm, readJson } from './lib.mjs';

const film = resolve(arg('film', 'film.html'));
const tl = normalizeTimeline(readJson(resolve(arg('timeline', 'timeline.json'))));
const dir = resolve(typeof arg('out') === 'string' ? arg('out') : join(dirname(film), 'review'));
mkdirSync(dir, { recursive: true });
const end = (t) => Math.round(Math.min(tl.total - 1 / tl.fps, Math.max(0, t)) * 100) / 100;

const beats = [];
for (const s of tl.scenes) {
  beats.push({ t: end(s.start + Math.min(.6, s.dur * .2)), label: `${s.id} · start` });
  beats.push({ t: end(s.start + s.dur / 2), label: `${s.id} · middle` });
  if (s.impact != null) beats.push({ t: end(s.start + s.impact + .5), label: `${s.id} · impact` });
}
beats.sort((a, b) => a.t - b.t);
const cuts = tl.scenes.slice(1).map((s, i) => ({ t: s.start, from: tl.scenes[i].id, to: s.id }));

const browser = await launch();
const errors = [];
const page = await openFilm(browser, film, tl, errors);
const shot = async (t, label, file) => {
  await page.evaluate((x) => window.render(x), t);
  await page.evaluate(({ label }) => {
    let tag = document.getElementById('__styleboard');
    if (!tag) { tag = document.createElement('div'); tag.id = '__styleboard'; document.body.append(tag); }
    tag.textContent = label;
    tag.style.cssText = 'position:fixed;left:24px;top:20px;z-index:99999;padding:8px 18px;font:600 30px/1.2 "Segoe UI","PingFang SC","Microsoft YaHei",sans-serif;color:#fff;background:rgba(0,0,0,.72);border-radius:10px;text-shadow:none;filter:none;opacity:1;clip-path:none';
  }, { label });
  await page.screenshot({ path: file });
  await page.evaluate(() => document.getElementById('__styleboard')?.remove());
  return file;
};

const beatFiles = [];
for (const [i, b] of beats.entries()) beatFiles.push(await shot(b.t, `${b.label}  ${b.t.toFixed(1)} s`, join(dir, `_b${String(i).padStart(3, '0')}.png`)));
const cutFiles = [];
for (const [i, c] of cuts.entries()) {
  for (const [j, d] of [-.2, -.1, 0, .1, .2].entries()) cutFiles.push(await shot(end(c.t + d), `${c.from} → ${c.to}  ${d > 0 ? '+' : ''}${d.toFixed(1)}`, join(dir, `_c${String(i).padStart(3, '0')}${j}.png`)));
}
await browser.close();

for (const f of readdirSync(dir)) if (/^(beats|cuts|phone)-.*\.jpg$/.test(f)) unlinkSync(join(dir, f));
const ratio = tl.height / tl.width;
contactSheet(beatFiles, join(dir, 'beats-%d.jpg'), { cols: 3, rows: Math.max(1, Math.min(Math.ceil(beatFiles.length / 3), Math.floor(4000 / (640 * ratio)))), cell: 640 });
if (cutFiles.length) contactSheet(cutFiles, join(dir, 'cuts-%d.jpg'), { cols: 5, rows: Math.max(1, Math.min(cuts.length, Math.floor(4000 / (384 * ratio)))), cell: 384 });
contactSheet(beatFiles, join(dir, 'phone-%d.jpg'), { cols: 4, rows: Math.max(1, Math.min(Math.ceil(beatFiles.length / 4), Math.floor(3000 / (360 * ratio)))), cell: 360 });
for (const f of [...beatFiles, ...cutFiles]) unlinkSync(f);

const note = join(dir, 'REVIEW.md');
if (!existsSync(note)) {
  const checkFile = typeof arg('check') === 'string' ? resolve(arg('check')) : null;
  const warnings = checkFile && existsSync(checkFile) ? readJson(checkFile).warnings : null;
  writeFileSync(note, `# 审片记录

> 先只看图（beats / cuts / phone），像第一次看到这部片的陌生人那样描述每一格；描述讲不出要讲的事，就是问题。
> 不给片子打分。声音只做了测量（verify 的响度），没有人耳试听，交付说明里照实写。

## 每一拍看到了什么

${beats.map((b) => `- ${b.t.toFixed(1)} s · ${b.label}：`).join('\n')}

## 剪切点

${cuts.map((c) => `- ${c.t.toFixed(1)} s · ${c.from} → ${c.to}：运动是否连贯、方向是否一致、有没有闪一下空白：`).join('\n') || '- （只有一场）'}

## 手机尺寸

- 360 px 宽下还能读的字：
- 读不出来的字（放大、删掉或标 data-noread）：

## 机检警告（check.mjs）

${warnings ? (warnings.map((w) => `- ${w.t.toFixed(1)} s · ${w.code}${w.text ? ` · ${w.text.slice(0, 30)}` : ''} → 改 / 保留（理由）：`).join('\n') || '- 无') : '- 运行 `node check.mjs --json check.json`，再用 `--check check.json` 生成本节。'}

## 修改清单

格式：\`t=4.2s · 位置 · 问题 → 改法 · 保留什么\`

- P0（看不懂、读不完、出错、违规，必须改）：
- P1（明显削弱效果，应该改）：
- P2（打磨，有余力再改）：

只改一轮：改完重渲染、重跑 check 和 review，再看一次 P0 是否清零。

## 交付说明

- 做了哪些创作决定（世界、手法、风格、声音调色板），为什么：
- 没做的另外两条故事线：
- 测量过的（时长、响度、机检）和只看过图的：
- 最弱的一个镜头，和原因：
- 保留下来的警告，和理由：
`);
}
const sheets = readdirSync(dir).filter((f) => /^(beats|cuts|phone)-.*\.jpg$/.test(f)).map((f) => relative(process.cwd(), join(dir, f)));
console.log(`review: ${beats.length} beats, ${cuts.length} cuts\n  ${sheets.join('\n  ')}\n  ${relative(process.cwd(), note)}`);
process.exit(errors.length ? 1 : 0);
