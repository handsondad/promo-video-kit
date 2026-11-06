// Deterministic film render: a page exposing `window.render(t)` (async ok; no CSS animations/transitions) is stepped frame by
// frame in headless Edge/Chrome, each screenshot piped to ffmpeg as MJPEG → H.264 (tv range, yuv420p) + AAC, faststart.
//   node render.mjs --film film.html --timeline timeline.json [--style keynote] [--size 1080x1920] [--audio vo.wav] [--out out/film.mp4] [--quality 92]
//   node render.mjs --film film.html --timeline timeline.json --preview 1,4.5,12   → preview/t*.png + preview/sheet-*.jpg
// The page receives window.TIMELINE = { fps, width, height, total, style, scenes:[{id,start,dur,...}], data } before it loads.
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { arg, contactSheet, ffmpeg, launch, normalizeTimeline, openFilm, readJson } from './lib.mjs';

const film = resolve(arg('film', 'film.html'));
const timeline = normalizeTimeline(readJson(resolve(arg('timeline', 'timeline.json'))));
const audio = arg('audio');
const out = resolve(arg('out', join(dirname(film), 'out', 'film.mp4')));
const quality = Number(arg('quality', 92));
const preview = arg('preview');
const { fps, total } = timeline;

const browser = await launch();
const errors = [];
const page = await openFilm(browser, film, timeline, errors);

if (preview) {
  const dir = join(dirname(film), 'preview');
  mkdirSync(dir, { recursive: true });
  const times = String(preview).split(',').map(Number);
  const files = [];
  for (const t of times) {
    await page.evaluate((x) => window.render(x), t);
    const f = join(dir, `t${String(t).replace('.', '_')}.png`);
    await page.screenshot({ path: f });
    files.push(f);
  }
  await browser.close();
  // A fresh name per run: image viewers cache by path, and a stale sheet looks like a fix that did nothing.
  for (const f of readdirSync(dir)) if (/^sheet-.*\.jpg$/.test(f)) unlinkSync(join(dir, f));
  const tag = Date.now().toString(36);
  if (files.length > 1) contactSheet(files, join(dir, `sheet-${tag}-%d.jpg`));
  const sheets = readdirSync(dir).filter((f) => f.startsWith(`sheet-${tag}`));
  console.log(`preview${timeline.style ? ` [${timeline.style}]` : ''}: ${files.length} stills in ${dir}${sheets.length ? `\n  sheets: ${sheets.map((f) => join(dir, f)).join(', ')}` : ''}${errors.length ? `\n  ${errors.length} page error(s)` : ''}`);
  process.exit(errors.length ? 1 : 0);
}

mkdirSync(dirname(out), { recursive: true });
const args = ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-'];
if (audio) args.push('-i', resolve(audio), '-map', '0:v', '-map', '1:a');
args.push('-vf', 'scale=in_range=pc:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'medium', '-crf', '18', '-color_range', 'tv');
if (audio) args.push('-c:a', 'aac', '-b:a', '192k', '-shortest');
args.push('-movflags', '+faststart', out);
const encoder = spawn(ffmpeg(), args, { stdio: ['pipe', 'inherit', 'inherit'] });
const done = new Promise((ok, fail) => encoder.on('close', (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)))));
const frames = Math.round(total * fps);
const started = Date.now();
for (let i = 0; i < frames; i += 1) {
  await page.evaluate((x) => window.render(x), i / fps);
  const jpeg = await page.screenshot({ type: 'jpeg', quality });
  if (!encoder.stdin.write(jpeg)) await new Promise((ok) => encoder.stdin.once('drain', ok));
  if (i % 300 === 0) console.log(`frame ${i}/${frames} (${((Date.now() - started) / 1000).toFixed(0)} s)`);
}
encoder.stdin.end();
await done;
await browser.close();
console.log(`wrote ${out} (${total.toFixed(1)} s, ${frames} frames, ${((Date.now() - started) / 1000).toFixed(0)} s${timeline.style ? `, style ${timeline.style}` : ''})${errors.length ? ` | ${errors.length} page error(s)` : ''}`);
