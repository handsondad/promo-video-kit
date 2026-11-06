// Takes a reference promo apart so its structure and style can be studied (then read the sheets/keyframes as images).
//   node analyze-reference.mjs <video> [--out ref] [--every 5] [--threshold 0.25]
// Writes <out>/info.json, <out>/sheet-N.jpg (1 frame/s, 5×6 per sheet), <out>/k-<sec>.jpg keyframes.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { arg, ffmpeg, run } from './lib.mjs';

const src = process.argv[2];
if (!src || src.startsWith('--')) { console.error('usage: node analyze-reference.mjs <video> [--out ref] [--every 5]'); process.exit(2); }
const out = resolve(arg('out', 'ref'));
const every = Number(arg('every', 5));
const threshold = Number(arg('threshold', .25));
mkdirSync(out, { recursive: true });
const ff = ffmpeg();
const q = (args) => run(ff, ['-hide_banner', ...args]).stderr;

const head = q(['-i', src]);
const dur = (() => { const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(head); return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0; })();
const video = /Stream #\S+: Video: ([^\n]+)/.exec(head)?.[1] ?? '';
const audio = /Stream #\S+: Audio: ([^\n]+)/.exec(head)?.[1] ?? null;
const size = /(\d{3,5})x(\d{3,5})/.exec(video);
const fps = /([\d.]+) fps/.exec(video)?.[1];

const cuts = [...q(['-i', src, '-vf', `select='gt(scene,${threshold})',showinfo`, '-an', '-f', 'null', '-']).matchAll(/pts_time:([\d.]+)/g)].map((m) => +(+m[1]).toFixed(2));

let loud = null, silences = [];
if (audio) {
  const a = q(['-i', src, '-vn', '-af', 'ebur128=framelog=quiet,silencedetect=n=-35dB:d=0.35', '-f', 'null', '-']);
  loud = { integrated_lufs: +(/I:\s+(-?[\d.]+) LUFS/.exec(a)?.[1] ?? NaN), lra: +(/LRA:\s+([\d.]+) LU/.exec(a)?.[1] ?? NaN) };
  const starts = [...a.matchAll(/silence_start: ([\d.]+)/g)].map((m) => +m[1]);
  const ends = [...a.matchAll(/silence_end: ([\d.]+)/g)].map((m) => +m[1]);
  silences = starts.map((s, i) => [+s.toFixed(2), +(ends[i] ?? dur).toFixed(2)]);
}
const audioHint = !audio ? 'no audio'
  : silences.length >= Math.max(3, dur / 12) ? 'many short silences: probably narration or dialogue (listen to confirm)'
  : 'continuous audio with few silences: probably a music bed, maybe with VO on top (listen to confirm)';

run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', src, '-vf', 'fps=1,scale=480:-1,tile=5x6', join(out, 'sheet-%d.jpg')]);
const keys = [];
for (let t = Math.min(1, dur / 2); t < dur; t += every) keys.push(+t.toFixed(2));
for (const c of cuts) if (!keys.some((k) => Math.abs(k - (c + .4)) < 1.5)) keys.push(+(c + .4).toFixed(2));
keys.sort((a, b) => a - b);
for (const t of keys) run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-ss', String(t), '-i', src, '-frames:v', '1', join(out, `k-${t}.jpg`)]);

const info = { source: resolve(src), duration: dur, width: size ? +size[1] : null, height: size ? +size[2] : null, fps: fps ? +fps : null, video, audio, loudness: loud, silences, audioHint, cuts, keyframes: keys.map((t) => `k-${t}.jpg`), sheets: Math.ceil(dur / 30) };
writeFileSync(join(out, 'info.json'), JSON.stringify(info, null, 2));
console.log(`${dur.toFixed(1)} s | ${info.width}x${info.height} | ${fps} fps | audio: ${audio ? audio.split(',')[0] : 'none'}`);
console.log(`hard cuts (scene>${threshold}): ${cuts.length ? cuts.join(' ') : 'none, so transitions are soft (motion graphics)'}`);
if (loud) console.log(`loudness ${loud.integrated_lufs} LUFS | LRA ${loud.lra} | silences ${silences.length} -> ${audioHint}`);
console.log(`wrote ${info.sheets} sheet(s) and ${keys.length} keyframes to ${out}; read them as images next.`);
