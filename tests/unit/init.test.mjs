import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SKILL, node, scratch } from '../helpers.mjs';

const json = (p) => JSON.parse(readFileSync(p, 'utf8'));
const sound = (slug) => json(join(SKILL, 'styles', slug, 'style.json')).sound;

function init(t, args, cwd) {
  const mine = scratch(t, 'promo-styles-');
  const r = node('init.mjs', args, { cwd, env: { PROMO_STYLES: mine } });
  assert.equal(r.status, 0, r.stderr);
  return { r, mine };
}

test('each cut gets its files, the chosen style and its sound palette', (t) => {
  const cuts = {
    motion: ['film.html', 'timeline.json', 'cues.json'],
    narrated: ['film.html', 'script.json'],
    patterns: ['patterns.html', 'patterns.timeline.json'],
  };
  for (const [cut, want] of Object.entries(cuts)) {
    const dir = join(scratch(t), 'film');
    init(t, ['--dir', dir, '--cut', cut, '--style', 'swiss']);
    for (const f of ['kit.js', 'kit.css', ...want, 'styles/swiss/style.js', 'styles/nebula/style.js']) assert.ok(existsSync(join(dir, f)), `${cut}: ${f}`);
    const main = want.find((f) => f.endsWith('.json') && f !== 'cues.json');
    assert.equal(json(join(dir, main)).style, 'swiss', `${cut}: style`);
    if (cut === 'motion') assert.equal(json(join(dir, 'cues.json')).palette, sound('swiss'));
  }
});

test('without --dir it writes .promo/film, not the current directory', (t) => {
  const cwd = scratch(t);
  init(t, ['--cut', 'motion'], cwd);
  assert.ok(existsSync(join(cwd, '.promo', 'film', 'film.html')));
  assert.ok(!existsSync(join(cwd, 'film.html')));
});

test('running it again keeps the recorded style, refreshes styles already there, and keeps edited templates', (t) => {
  const dir = join(scratch(t), 'film');
  init(t, ['--dir', dir, '--cut', 'motion', '--style', 'whiteboard']);
  writeFileSync(join(dir, 'styles', 'whiteboard', 'theme.css'), '/* stale */');
  writeFileSync(join(dir, 'film.html'), '<!-- mine -->');
  init(t, ['--dir', dir]);
  assert.equal(json(join(dir, 'timeline.json')).style, 'whiteboard');
  assert.notEqual(readFileSync(join(dir, 'styles', 'whiteboard', 'theme.css'), 'utf8'), '/* stale */');
  assert.equal(readFileSync(join(dir, 'film.html'), 'utf8'), '<!-- mine -->');
});

test('--brand adds brand.css and records it', (t) => {
  const dir = join(scratch(t), 'film');
  init(t, ['--dir', dir, '--cut', 'narrated', '--style', 'editorial', '--brand']);
  assert.ok(existsSync(join(dir, 'brand.css')));
  assert.equal(json(join(dir, 'script.json')).brand, 'brand.css');
});

test('--new-style makes a style of your own that a film can use', (t) => {
  const mine = scratch(t, 'promo-styles-');
  const env = { PROMO_STYLES: mine };
  const made = node('init.mjs', ['--new-style', 'night-lab', '--name', '夜间实验室', '--from', 'keynote'], { env });
  assert.equal(made.status, 0, made.stderr);
  const meta = json(join(mine, 'night-lab', 'style.json'));
  assert.equal(meta.slug, 'night-lab');
  assert.equal(meta.basedOn, 'keynote');
  assert.match(readFileSync(join(mine, 'night-lab', 'style.js'), 'utf8'), /defineStyle\(\{\s*id:\s*['"]night-lab['"]/);
  assert.ok(existsSync(join(mine, 'README.md')));
  const dir = join(scratch(t), 'film');
  const used = node('init.mjs', ['--dir', dir, '--cut', 'motion', '--style', 'night-lab'], { env });
  assert.equal(used.status, 0, used.stderr);
  assert.match(used.stdout, /your own/);
  assert.ok(existsSync(join(dir, 'styles', 'night-lab', 'theme.css')));
});

test('an unknown style or cut fails with the choices', (t) => {
  const dir = join(scratch(t), 'film');
  const a = node('init.mjs', ['--dir', dir, '--style', 'nope']);
  assert.notEqual(a.status, 0);
  assert.match(a.stderr, /Available: .*swiss/);
  const b = node('init.mjs', ['--dir', dir, '--cut', 'nope']);
  assert.notEqual(b.status, 0);
  assert.match(b.stderr, /motion \| narrated \| patterns/);
});
