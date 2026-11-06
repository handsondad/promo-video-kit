// Narration → timeline. Each scene lasts max(min, lead + narration + tail); the voice track places every line at its cue.
//   node tts.mjs script.json [--out .]   → <out>/vo/*.mp3 + .srt (cached by voice+rate+text), <out>/timeline.json, <out>/vo.wav
// script.json: { voice, rate, lead, tail, firstLead, fps, style, width, height, data, scenes: [{ id, min, vo, sub? }] }
//   vo  is what the voice reads (numbers and names written the way they are said; "" for a silent scene);
//   sub is what the subtitle shows, when it differs ("百分之二十八点三" said, "28.3%" shown). Both split into sentences at
//   。！？ and must have the same number of them: sentence i of sub is shown while sentence i of vo is spoken.
// Subtitle times come from the speech service's sentence boundaries, not from character counts.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { arg, duration, ffmpeg, python, readJson, run } from './lib.mjs';

const file = process.argv[2];
if (!file || file.startsWith('--')) { console.error('usage: node tts.mjs script.json [--out dir]'); process.exit(2); }
const script = readJson(file);
const out = resolve(arg('out', '.'));
const { voice = 'zh-CN-YunyangNeural', rate = '+4%', lead = .45, tail = .7, firstLead = .7, fps = 30, volume = 1.15 } = script;
const py = python();
if (!py) throw new Error('No venv python with edge-tts; run setup.mjs.');
const voDir = join(out, 'vo');
mkdirSync(voDir, { recursive: true });

const sentences = (text) => (text.match(/[^。！？!?]+[。！？!?]*/g) ?? []).map((s) => s.trim()).filter(Boolean);
const srtTime = (s) => { const [h, m, rest] = s.split(':'); return Number(h) * 3600 + Number(m) * 60 + Number(rest.replace(',', '.')); };
const readSrt = (p) => readFileSync(p, 'utf8').split(/\r?\n\r?\n/).map((block) => {
  const m = /(\d+:\d+:\d+,\d+)\s*-->\s*(\d+:\d+:\d+,\d+)\s*\r?\n([\s\S]*)/.exec(block);
  return m && { start: srtTime(m[1]), end: srtTime(m[2]), text: m[3].trim() };
}).filter(Boolean);
const SPOKEN_NUMBER = /百分之|[零〇一二两三四五六七八九十百千万]+点[零〇一二三四五六七八九]/;
const warnings = [];

for (const s of script.scenes) {
  if (!s.vo) { s.voDur = 0; continue; }
  const key = createHash('sha1').update(`${voice}|${rate}|${s.vo}`).digest('hex').slice(0, 10);
  s.file = join(voDir, `${s.id}-${key}.mp3`);
  s.srt = join(voDir, `${s.id}-${key}.srt`);
  if (!existsSync(s.file) || !existsSync(s.srt)) {
    const made = run(py, ['-m', 'edge_tts', '--voice', voice, `--rate=${rate}`, '--text', s.vo, '--write-media', s.file, '--write-subtitles', s.srt]);
    if (made.status !== 0) throw new Error(`tts ${s.id}: ${made.stderr}`);
  }
  s.voDur = duration(s.file);

  const spoken = readSrt(s.srt);
  const shown = sentences(s.sub ?? s.vo);
  if (spoken.length === shown.length) {
    s.cues = spoken.map((c, i) => ({ at: c.start, dur: Math.max(.3, c.end - c.start), text: shown[i] }));
  } else {
    warnings.push(`${s.id}: the subtitle has ${shown.length} sentence(s) and the voice ${spoken.length}; subtitles fall back to timing by length. Make sub and vo end sentences in the same places.`);
  }
  if (!s.sub && SPOKEN_NUMBER.test(s.vo)) warnings.push(`${s.id}: the narration spells out a number; add "sub" with the figure as shown on screen, or the subtitle shows the spoken form.`);
  // A Latin word (a product name) takes about two syllables of time; short lines are allowed to breathe.
  const chars = (s.vo.match(/[\u3400-\u9fff]/g) ?? []).length + 2 * (s.vo.match(/[A-Za-z0-9]+/g) ?? []).length;
  const cps = chars / s.voDur;
  if (s.voDur > 1.5 && (cps > 5.5 || (cps < 3.5 && chars >= 16))) warnings.push(`${s.id}: ${cps.toFixed(1)} characters a second (aim for 4–5); ${cps > 5.5 ? 'cut words or slow the rate' : 'tighten the copy or raise the rate'}.`);
}

let at = 0;
const scenes = script.scenes.map((s, i) => {
  const l = i === 0 ? firstLead : lead;
  const dur = Math.max(s.min ?? 0, s.voDur ? l + s.voDur + tail : 0);
  const vo = s.vo ? {
    start: at + l, dur: s.voDur, text: s.vo, sub: s.sub ?? s.vo,
    ...(s.cues ? { cues: s.cues.map((c) => ({ start: +(at + l + c.at).toFixed(3), dur: +c.dur.toFixed(3), text: c.text })) } : {}),
  } : null;
  const item = { id: s.id, start: at, dur, ...(vo ? { vo } : {}) };
  at += dur;
  return item;
});
const total = at;
const { style, brand, width, height } = script;
writeFileSync(join(out, 'timeline.json'), JSON.stringify({ fps, total, style, brand, width, height, scenes, data: script.data ?? {} }, null, 2));
console.log(`total ${total.toFixed(1)} s`);
for (const s of scenes) console.log(`  ${s.id.padEnd(10)} ${s.start.toFixed(1).padStart(6)} +${s.dur.toFixed(1)}${s.vo ? `  vo ${s.vo.dur.toFixed(1)}, ${s.vo.cues?.length ?? 0} timed sentence(s)` : ''}`);
for (const w of warnings) console.warn(`warning: ${w}`);

const voiced = script.scenes.map((s, i) => ({ s, t: scenes[i] })).filter(({ s }) => s.file);
const inputs = voiced.flatMap(({ s }) => ['-i', s.file]);
const delays = voiced.map(({ t }, i) => `[${i}:a]adelay=${Math.round(t.vo.start * 1000)}:all=1[a${i}]`).join(';');
const mix = `${delays};${voiced.map((_, i) => `[a${i}]`).join('')}amix=inputs=${voiced.length}:normalize=0,apad,atrim=0:${total.toFixed(3)},volume=${volume}[out]`;
const r = run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-y', ...inputs, '-filter_complex', mix, '-map', '[out]', '-ar', '48000', '-ac', '2', join(out, 'vo.wav')]);
if (r.status !== 0) throw new Error(`mix: ${r.stderr}`);
console.log('wrote', join(out, 'timeline.json'), 'and', join(out, 'vo.wav'));
