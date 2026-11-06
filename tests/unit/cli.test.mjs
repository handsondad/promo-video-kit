import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { REPO, SKILL, node } from '../helpers.mjs';

const promo = (...args) => node(join(REPO, 'bin', 'promo.mjs'), args);

test('--version prints the skill version', () => {
  const r = promo('--version');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.trim(), readFileSync(join(SKILL, 'VERSION'), 'utf8').trim());
});

test('help lists every command, and each maps to a script', () => {
  const r = promo('help');
  assert.equal(r.status, 0);
  const names = [...r.stdout.matchAll(/^ {2}([a-z]+) /gm)].map((m) => m[1]);
  assert.ok(names.length >= 12, names.join(','));
  const source = readFileSync(join(REPO, 'bin', 'promo.mjs'), 'utf8');
  const scripts = [...source.matchAll(/^\s+[a-z]+: \['([a-z-]+)',/gm)].map((m) => m[1]);
  assert.equal(scripts.length, names.length);
  for (const script of scripts) assert.ok(existsSync(join(SKILL, 'scripts', `${script}.mjs`)), script);
});

test('an unknown command exits 2', () => {
  assert.equal(promo('nope').status, 2);
});

test('arguments and exit codes pass through', () => {
  const r = promo('init', '--dir', join(REPO, '.promo', 'never'), '--style', 'nope');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /style "nope" not found/);
});
