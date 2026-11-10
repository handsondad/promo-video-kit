import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { PALETTES, resolveCues, writeScore } from '../../skills/product-promo-video/scripts/music.mjs';
import { SKILL, scratch } from '../helpers.mjs';

const timeline = { fps: 30, scenes: [{ id: 'hook', dur: 2 }, { id: 'logo', dur: 1.5 }, { id: 'end', dur: 1 }] };

test('cue times resolve against scenes and land one frame late by default', () => {
  const c = resolveCues({ grid: 'logo+0.5', impacts: ['logo+0.5', 'end+0.5'], groove: ['start', 'end'], ticks: [1] }, timeline);
  assert.equal(c.total, 4.5);
  assert.equal(c.grid, 2.5);
  assert.deepEqual(c.groove, [0, 3.5], 'a scene called end wins over the film end');
  assert.ok(Math.abs(c.impacts[0] - (2.5 + 1 / 30)) < 1e-9);
  assert.ok(Math.abs(c.impacts[1] - (4 + 1 / 30)) < 1e-9);
  assert.ok(Math.abs(c.ticks[0] - (1 + 1 / 30)) < 1e-9);
  assert.equal(resolveCues({ impacts: ['logo'], lag: 0 }, timeline).impacts[0], 2);
});

test('without a scene of that name, end is the end of the film', () => {
  const tl = { fps: 30, scenes: [{ id: 'hook', dur: 2 }, { id: 'outro', dur: 3 }] };
  assert.deepEqual(resolveCues({ breath: ['outro', 'end-0.5'] }, tl).breath, [2, 4.5]);
});

test('a cue naming a missing scene fails', () => {
  assert.throws(() => resolveCues({ impacts: ['nope+1'] }, timeline), /no scene nope/);
});

test('every palette writes a 48 kHz stereo WAV of the film length with sound in it', (t) => {
  const dir = scratch(t);
  for (const palette of Object.keys(PALETTES)) {
    const cue = resolveCues({ palette, impacts: ['logo'], whooshes: ['logo-0.3'], ticks: [0.5, 1, 1.5], groove: ['hook', 'end'], hats: ['hook', 'end'], arp: ['hook', 'end'] }, timeline);
    const file = join(dir, `${palette}.wav`);
    writeScore(file, cue);
    const wav = readFileSync(file);
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt16LE(22), 2, `${palette}: channels`);
    assert.equal(wav.readUInt32LE(24), 48000, `${palette}: rate`);
    assert.equal(wav.readUInt32LE(40), Math.ceil(4.5 * 48000) * 4, `${palette}: length`);
    let peak = 0;
    for (let i = 44; i < wav.length; i += 2) peak = Math.max(peak, Math.abs(wav.readInt16LE(i)));
    assert.ok(peak > 8000, `${palette}: peak ${peak}`);
  }
});

test('--sfx splits the hits off the bed on the same scale, so the two add up to the score', (t) => {
  const dir = scratch(t);
  const cue = resolveCues({ palette: 'pop', impacts: ['logo'], ticks: [0.5, 1], groove: ['hook', 'end'], arp: ['hook', 'end'] }, timeline);
  const samples = (f) => { const b = readFileSync(join(dir, f)); return Int16Array.from({ length: (b.length - 44) / 2 }, (_, i) => b.readInt16LE(44 + i * 2)); };
  writeScore(join(dir, 'score.wav'), cue);
  writeScore(join(dir, 'bed.wav'), cue, join(dir, 'sfx.wav'));
  const [score, bed, sfx] = ['score.wav', 'bed.wav', 'sfx.wav'].map(samples);
  assert.equal(bed.length, score.length);
  assert.equal(sfx.length, score.length);
  const energy = (a, from, to) => { let s = 0; for (let i = from; i < to; i += 1) s += a[i] * a[i]; return s / (to - from); };
  const at = (sec) => Math.round(sec * 48000) * 2;
  assert.equal(energy(sfx, 0, at(.4)), 0, 'no hits before the first tick');
  assert.ok(energy(sfx, at(.5), at(.6)) > 0, 'the tick is in the sfx track');
  let err = 0, sig = 0;
  for (let i = 0; i < score.length; i += 1) { err += (bed[i] + sfx[i] - score[i]) ** 2; sig += score[i] ** 2; }
  const rel = Math.sqrt(err / sig);
  assert.ok(rel < .05, `bed + sfx is ${(rel * 100).toFixed(1)}% off the score (only the soft clip on loud peaks differs)`);
});

test('the motion template cues resolve against its timeline', () => {
  const read = (f) => JSON.parse(readFileSync(join(SKILL, 'templates', f), 'utf8'));
  const c = resolveCues(read('motion.cues.json'), read('motion.timeline.json'));
  for (const t of [...c.impacts, ...(c.whooshes ?? []), ...(c.ticks ?? []), ...(c.breath ?? [])]) assert.ok(t >= 0 && t <= c.total, `cue at ${t} outside the ${c.total} s film`);
});
