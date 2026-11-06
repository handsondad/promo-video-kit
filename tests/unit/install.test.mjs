import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { SKILL, node, scratch } from '../helpers.mjs';

test('install copies the skill, backs up what it replaces, links and unlinks without touching the source', (t) => {
  const root = scratch(t);
  const skills = join(root, 'skills'), tools = join(root, 'tools');
  const env = { PROMO_TOOLS: tools };
  const dest = join(skills, 'product-promo-video');
  const install = (...extra) => {
    const r = node('install.mjs', ['--target', skills, ...extra], { env });
    assert.equal(r.status, 0, r.stderr);
    return r;
  };

  install();
  assert.equal(readFileSync(join(dest, 'VERSION'), 'utf8'), readFileSync(join(SKILL, 'VERSION'), 'utf8'));
  assert.ok(!existsSync(join(tools, 'backup')), 'nothing to back up the first time');

  writeFileSync(join(dest, 'local-note.md'), 'edited in place');
  install();
  assert.ok(!existsSync(join(dest, 'local-note.md')), 'a reinstall replaces the copy');
  assert.equal(readdirSync(join(tools, 'backup')).filter((f) => f.endsWith('.tar.gz')).length, 1, 'the replaced copy is backed up');

  install('--link');
  assert.ok(lstatSync(dest).isSymbolicLink(), 'a link');
  assert.ok(existsSync(join(dest, 'SKILL.md')), 'the link resolves');

  const r = install();
  assert.match(r.stdout, /replaced a link/);
  assert.ok(!lstatSync(dest).isSymbolicLink());
  assert.ok(existsSync(join(SKILL, 'SKILL.md')), 'the source survives replacing the link');
});

test('an unknown agent fails with the choices', () => {
  const r = node('install.mjs', ['--agent', 'nope']);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /expected cursor \| claude \| codex \| copilot or all/);
});

test('without --agent it installs for the agents present, --agent picks, --list reports', (t) => {
  const home = scratch(t);
  const env = { USERPROFILE: home, HOME: home, PROMO_TOOLS: join(home, 'tools'), CLAUDE_CONFIG_DIR: undefined };
  const at = (...p) => join(home, ...p, 'product-promo-video', 'SKILL.md');
  mkdirSync(join(home, '.claude'));
  mkdirSync(join(home, '.codex', 'skills', 'product-promo-video'), { recursive: true });
  writeFileSync(join(home, '.codex', 'skills', 'product-promo-video', 'SKILL.md'), 'an old copy where Codex would list it twice');
  const r = node('install.mjs', [], { env });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(existsSync(at('.claude', 'skills')));
  assert.ok(existsSync(at('.agents', 'skills')), 'Codex gets it in ~/.agents/skills');
  assert.ok(!existsSync(at('.codex', 'skills')), 'the duplicate in ~/.codex/skills is moved out');
  assert.match(r.stdout, /removed the duplicate/);
  assert.equal(readdirSync(join(home, 'tools', 'backup')).filter((f) => f.includes('codex-legacy')).length, 1, 'and backed up');
  assert.ok(!existsSync(join(home, '.cursor')) && !existsSync(join(home, '.copilot')), 'an agent that is not there is left alone');

  const picked = node('install.mjs', ['--agent', 'cursor,copilot,agents'], { env });
  assert.equal(picked.status, 0, picked.stderr);
  assert.ok(existsSync(at('.cursor', 'skills')));
  assert.ok(existsSync(at('.copilot', 'skills')));
  assert.match(picked.stdout, /^codex: installed/m, '`agents` is the codex target');

  const list = node('install.mjs', ['--list'], { env });
  assert.equal(list.status, 0, list.stderr);
  const version = readFileSync(join(SKILL, 'VERSION'), 'utf8').trim();
  for (const key of ['cursor', 'claude', 'codex', 'copilot']) assert.match(list.stdout, new RegExp(`^${key} +${version.replaceAll('.', '\\.')} `, 'm'));

  const custom = join(home, 'claude-config');
  const claude = node('install.mjs', ['--agent', 'claude'], { env: { ...env, CLAUDE_CONFIG_DIR: custom } });
  assert.equal(claude.status, 0, claude.stderr);
  assert.ok(existsSync(join(custom, 'skills', 'product-promo-video', 'SKILL.md')), 'CLAUDE_CONFIG_DIR is honoured');
});
