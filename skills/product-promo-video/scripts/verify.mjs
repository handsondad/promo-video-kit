// Checks a finished film: duration, codecs, pixel format/range, audio loudness, true peak and low-end share; writes a
// contact sheet to read as an image. It measures the sound; it does not listen to it.
//   node verify.mjs out/film.mp4 [--expect 62.5] [--every 5]
import { readdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { arg, ffmpeg, run } from './lib.mjs';

const file = process.argv[2];
if (!file || file.startsWith('--')) { console.error('usage: node verify.mjs <video> [--expect seconds] [--every 5]'); process.exit(2); }
const ff = ffmpeg();
const head = run(ff, ['-hide_banner', '-i', file]).stderr;
const m = /Duration: (\d+):(\d+):([\d.]+)/.exec(head);
const dur = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0;
const video = /Video: ([^\n]+)/.exec(head)?.[1] ?? '';
const audio = /Audio: ([^\n]+)/.exec(head)?.[1] ?? '';
const problems = [];
if (!/h264/.test(video)) problems.push('video is not H.264');
if (/yuvj|\(pc/.test(video)) problems.push('full-range (yuvj/pc) video: colours shift in some players; render with scale=in_range=pc:out_range=tv,format=yuv420p');
if (!/yuv420p/.test(video)) problems.push('pixel format is not yuv420p');
const expect = arg('expect');
if (expect && Math.abs(dur - Number(expect)) > .2) problems.push(`duration ${dur.toFixed(2)} s, expected ${expect}`);
let loud = '';
if (!audio) problems.push('no audio stream');
else {
  const a = run(ff, ['-hide_banner', '-i', file, '-vn', '-af', 'ebur128=framelog=quiet:peak=true', '-f', 'null', '-']).stderr;
  const I = +(/I:\s+(-?[\d.]+) LUFS/.exec(a)?.[1] ?? NaN), peak = +(/Peak:\s+(-?[\d.]+) dBFS/.exec(a)?.[1] ?? NaN);
  // Share of the energy below 150 Hz: phone and laptop speakers drop it, so a bed that lives there sounds empty.
  const mean = (af) => +(/mean_volume:\s*(-?[\d.]+) dB/.exec(run(ff, ['-hide_banner', '-i', file, '-vn', '-af', `${af}volumedetect`, '-f', 'null', '-']).stderr)?.[1] ?? NaN);
  const low = mean('lowpass=f=150,lowpass=f=150,') - mean('');
  loud = `${I} LUFS, true peak ${peak} dBTP, below 150 Hz ${low.toFixed(1)} dB of the whole`;
  if ([I, peak, low].some(Number.isNaN)) problems.push('could not measure the audio (loudness, true peak or low end); check the audio stream with ffmpeg');
  if (I < -18 || I > -12) problems.push(`loudness ${I} LUFS (aim for -16…-14 for web and social)`);
  if (peak > -1) problems.push(`true peak ${peak} dBTP: keep it at -1 or lower, or players and re-encoders clip it`);
  if (low > -2) problems.push(`most of the energy sits below 150 Hz (${low.toFixed(1)} dB): phone speakers lose it; lift the mids or thin the bass`);
}
const every = Number(arg('every', Math.max(2, Math.round(dur / 16))));
const stem = basename(file).replace(/\.\w+$/, '');
for (const f of readdirSync(dirname(file) || '.')) if (f.startsWith(`${stem}-sheet-`) && f.endsWith('.jpg')) unlinkSync(join(dirname(file), f));
const sheet = join(dirname(file), `${stem}-sheet-${Date.now().toString(36)}.jpg`);
run(ff, ['-hide_banner', '-loglevel', 'error', '-y', '-i', file, '-vf', `fps=1/${every},scale=480:-1,tile=4x4`, '-frames:v', '1', sheet]);
console.log(`${file}\n  ${dur.toFixed(2)} s\n  video ${video.split(',').slice(0, 3).join(',')}\n  audio ${audio ? audio.split(',')[0] : 'none'} ${loud}\n  sheet ${sheet} (every ${every} s)`);
console.log(problems.length ? `PROBLEMS:\n- ${problems.join('\n- ')}` : 'OK');
process.exit(problems.length ? 1 : 0);
