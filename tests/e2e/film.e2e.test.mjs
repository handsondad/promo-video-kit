// The whole pipeline on this machine's tools: init → preview → music → master → check → review → render → verify.
// Skipped when doctor says the machine is not ready. About a minute.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { node, scratch } from '../helpers.mjs';

const doctor = node('doctor.mjs', ['--json']);
const ready = doctor.status === 0;

test('a short motion film goes from init to a verified MP4 with no check warnings', { skip: !ready && 'doctor: not ready', timeout: 600_000 }, (t) => {
  const dir = join(scratch(t, 'promo-e2e-'), 'film');
  mkdirSync(dir);
  const run = (script, args) => {
    const r = node(script, args, { cwd: dir });
    assert.equal(r.status, 0, `${script} ${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
    return r;
  };
  run('init.mjs', ['--dir', dir, '--cut', 'motion', '--style', 'editorial', '--brand']);

  // A cut-down of the opening and the end card keeps the full render short; the dropped scenes must not show.
  const tl = JSON.parse(readFileSync(join(dir, 'timeline.json'), 'utf8'));
  tl.scenes = tl.scenes.filter((s) => s.id === 'hook' || s.id === 'end');
  delete tl.total;
  writeFileSync(join(dir, 'timeline.json'), JSON.stringify(tl, null, 2));
  const total = tl.scenes.reduce((a, s) => a + s.dur, 0);
  writeFileSync(join(dir, 'cues.json'), JSON.stringify({ palette: 'felt', ticks: ['hook+1', 'hook+2.5'], impacts: ['end+0.5'], breath: ['end-0.6', 'end+0.5'] }, null, 2));

  const preview = run('render.mjs', ['--film', 'film.html', '--timeline', 'timeline.json', '--preview', '1,6']);
  assert.match(preview.stdout, /2 stills/);
  assert.equal(readdirSync(join(dir, 'preview')).filter((f) => f.endsWith('.png')).length, 2);

  const music = run('music.mjs', ['--timeline', 'timeline.json', '--cues', 'cues.json', '--out', 'bed.wav', '--sfx', 'sfx.wav']);
  assert.doesNotMatch(music.stderr, /outside the/, 'every cue lands inside the film');
  const mix = run('mix.mjs', ['--music', 'bed.wav', '--sfx', 'sfx.wav', '--out', 'score.wav']);
  assert.match(mix.stdout, /linear/, `two-pass linear loudness: ${mix.stdout}`);
  const check = run('check.mjs', ['--film', 'film.html', '--timeline', 'timeline.json', '--json', 'check.json']);
  const warnings = JSON.parse(readFileSync(join(dir, 'check.json'), 'utf8')).warnings;
  assert.deepEqual(warnings.map((w) => `${w.code}@${w.t}`), [], check.stdout);

  run('review.mjs', ['--film', 'film.html', '--timeline', 'timeline.json', '--check', 'check.json']);
  for (const f of ['beats-1.jpg', 'cuts-1.jpg', 'phone-1.jpg', 'REVIEW.md']) assert.ok(existsSync(join(dir, 'review', f)), f);

  run('render.mjs', ['--film', 'film.html', '--timeline', 'timeline.json', '--audio', 'score.wav', '--out', 'out/e2e.mp4']);
  const verify = run('verify.mjs', ['out/e2e.mp4', '--expect', String(total)]);
  assert.match(verify.stdout, /h264/);
  assert.match(verify.stdout, /aac/);
  assert.match(verify.stdout, /OK/);
});
