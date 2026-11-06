// Mix and master: narration, the music bed and the hits on their own buses; only the bed ducks under the voice.
//   node mix.mjs [--voice vo.wav] --music score.wav [--sfx sfx.wav] [--timeline timeline.json] --out mix.wav
//                [--music-gain -12] [--duck -14] [--lufs -15]
// With --timeline the bed dips ahead of every narration line (from the known vo.start / vo.dur: down over 0.15 s
// before the voice, back up over 0.4 s after; pauses under 0.6 s stay ducked); without it a sidechain reacts to the
// voice. The hits never duck: they keep the level they have against the bed in the pauses. Without --voice it only
// masters (the motion cut). Loudness: two passes, the second linear, to --lufs with true peak -1.5 dBTP.
import { arg, ffmpeg, normalizeTimeline, readJson, run } from './lib.mjs';

const voice = typeof arg('voice') === 'string' ? arg('voice') : null;
const music = arg('music'), sfx = typeof arg('sfx') === 'string' ? arg('sfx') : null, out = arg('out', 'mix.wav');
if (typeof music !== 'string') { console.error('usage: node mix.mjs [--voice vo.wav] --music score.wav [--sfx sfx.wav] [--timeline timeline.json] --out mix.wav'); process.exit(2); }
const gain = Number(arg('music-gain', voice ? -12 : 0)), duck = Number(arg('duck', -14)), lufs = Number(arg('lufs', -15));
const tlFile = typeof arg('timeline') === 'string' ? arg('timeline') : null;

// The ducking envelope as an ffmpeg expression: 1 outside the voice, 10^(duck/20) under it.
function envelope(tl) {
  const spans = [];
  for (const s of tl.scenes) if (s.vo) {
    const a = s.vo.start, b = s.vo.start + s.vo.dur;
    if (spans.length && a - spans.at(-1)[1] < .6) spans.at(-1)[1] = b; else spans.push([a, b]);
  }
  if (!spans.length) return null;
  const shape = ([a, b]) => `clip((t-${(a - .15).toFixed(3)})/0.15,0,1)*clip((${(b + .4).toFixed(3)}-t)/0.4,0,1)`;
  const under = spans.map(shape).reduce((acc, s) => (acc ? `max(${acc},${s})` : s), '');
  return `1-${(1 - 10 ** (duck / 20)).toFixed(4)}*${under}`;
}

const inputs = [], parts = [];
const input = (f) => { inputs.push('-i', f); return inputs.length / 2 - 1; };
const v = voice ? input(voice) : -1, m = input(music), x = sfx ? input(sfx) : -1;
let graph = `[${m}:a]volume=${gain}dB`;
if (voice) {
  const env = tlFile ? envelope(normalizeTimeline(readJson(tlFile))) : null;
  // Speech synthesis peaks ~20 dB over its loudness; a voice compressor (level kept by the makeup) takes the first few dB.
  const comp = `[${v}:a]acompressor=threshold=-34dB:ratio=4:attack=3:release=120:knee=6:makeup=4`;
  if (env) graph += `,volume='${env}':eval=frame[bed];${comp}[vv];`;
  else graph += `[pre];${comp},asplit=2[vv][sc];[pre][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[bed];`;
  parts.push('[vv]', '[bed]');
} else {
  graph += '[bed];';
  parts.push('[bed]');
}
if (sfx) { graph += `[${x}:a]volume=${gain}dB[hits];`; parts.push('[hits]'); }
graph += `${parts.join('')}amix=inputs=${parts.length}:normalize=0:duration=longest[mixed]`;

const base = ['-hide_banner', '-y', ...inputs, '-filter_complex'];
const loudness = (r) => { if (r.status !== 0) throw new Error(r.stderr); return JSON.parse(r.stderr.slice(r.stderr.lastIndexOf('{'), r.stderr.lastIndexOf('}') + 1)); };
const measure = (tail) => loudness(run(ffmpeg(), [...base, `${graph};[mixed]${tail}loudnorm=I=${lufs}:TP=-1.5:LRA=11:print_format=json[out]`, '-map', '[out]', '-f', 'null', '-']));
// Linear gain only fits when the peaks leave room for it; otherwise limit just the peaks first (1 dB spare) and measure
// again. Limiting lowers the loudness, which asks for more gain, so this settles over a few rounds.
let tail = '', measured = measure(tail), ceiling = 0;
const peak = Number(measured.input_tp);
for (let round = 0; round < 4 && Number(measured.input_tp) + (lufs - Number(measured.input_i)) > -1.5; round += 1) {
  ceiling = Math.min(ceiling || 0, -1.5 - (lufs - Number(measured.input_i)) - 1);
  tail = `alimiter=limit=${Math.min(1, 10 ** (ceiling / 20)).toFixed(4)}:level=disabled:attack=2:release=60,`;
  measured = measure(tail);
}
if (tail && peak - ceiling > 6) console.warn(`warning: ${(peak - ceiling).toFixed(1)} dB of peaks limited to reach ${lufs} LUFS; if it sounds squashed, lower --lufs (e.g. -16)`);
const norm = `loudnorm=I=${lufs}:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}` +
  `:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true:print_format=json`;
const after = loudness(run(ffmpeg(), [...base, `${graph};[mixed]${tail}${norm}[out]`, '-map', '[out]', '-ar', '48000', '-ac', '2', out]));
console.log(`wrote ${out}: ${voice ? `voice + bed${tlFile ? ' (ducked from the timeline)' : ' (sidechain)'}` : 'bed'}${sfx ? ' + hits' : ''}, ` +
  `${Number(measured.input_i).toFixed(1)} → ${lufs} LUFS, ${after.normalization_type}${tail ? `, peaks limited to ${ceiling.toFixed(1)} dBFS first` : ''}`);
if (after.normalization_type !== 'linear') console.warn('warning: loudness fell back to dynamic normalisation (it pumps); lower --lufs or the hits');
