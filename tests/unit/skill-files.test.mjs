import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { PALETTES } from '../../skill/product-promo-video/scripts/music.mjs';
import { REPO, SKILL, walk } from '../helpers.mjs';

const read = (p) => readFileSync(p, 'utf8');
const files = walk(SKILL);

test('every script parses', () => {
  const scripts = [...files.filter((f) => f.endsWith('.mjs')), join(SKILL, 'templates', 'kit.js'), ...walk(join(REPO, 'bin'))];
  for (const f of files.filter((f) => /styles[\\/][^\\/]+[\\/]style\.js$/.test(f))) scripts.push(f);
  for (const f of scripts) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${relative(REPO, f)}: ${r.stderr}`);
  }
});

test('SKILL.md frontmatter loads in every agent: known keys, a short description', () => {
  const head = read(join(SKILL, 'SKILL.md')).match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(head, 'frontmatter');
  const keys = [...head[1].matchAll(/^([a-z-]+):/gm)].map((m) => m[1]);
  for (const k of keys) assert.ok(['name', 'description', 'license', 'allowed-tools', 'metadata'].includes(k), `frontmatter key ${k}`);
  assert.match(head[1], /^name: product-promo-video$/m);
  const description = head[1].split(/^description:/m)[1].replace(/^\s*>-?/, '').replace(/\s+/g, ' ').trim();
  assert.ok(Buffer.byteLength(description) <= 512, `description is ${Buffer.byteLength(description)} bytes; agents list every skill's description, keep it ≤ 512`);
});

test('inline code in the docs survives Claude Code skill loading (no ! and no > before a word)', () => {
  for (const f of files.filter((f) => f.endsWith('.md'))) {
    const text = read(f).replace(/^```[\s\S]*?^```/gm, '');
    for (const [code] of text.matchAll(/`[^`\n]+`/g)) assert.ok(!/!|>\w/.test(code), `${relative(REPO, f)}: ${code}`);
  }
});

test('every JSON file parses', () => {
  for (const f of files.filter((f) => f.endsWith('.json'))) assert.doesNotThrow(() => JSON.parse(read(f)), relative(REPO, f));
});

test('every style is complete and names its own slug and a known sound palette', () => {
  const root = join(SKILL, 'styles');
  const styles = readdirSync(root).filter((d) => !d.startsWith('_'));
  assert.ok(styles.length >= 8, `only ${styles.length} styles`);
  for (const slug of [...styles, '_template']) {
    for (const f of ['style.js', 'theme.css', 'style.json', 'STYLE.md']) assert.ok(existsSync(join(root, slug, f)), `${slug}/${f}`);
  }
  for (const slug of styles) {
    const meta = JSON.parse(read(join(root, slug, 'style.json')));
    assert.equal(meta.slug, slug);
    assert.ok(meta.cn, `${slug}: cn`);
    assert.ok(PALETTES[meta.sound], `${slug}: sound ${meta.sound}`);
    assert.match(read(join(root, slug, 'style.js')), new RegExp(`defineStyle\\(\\{\\s*id:\\s*['"]${slug}['"]`), `${slug}/style.js defines ${slug}`);
  }
});

test('relative links and script references in the docs resolve', () => {
  for (const f of files.filter((f) => extname(f) === '.md')) {
    const text = read(f);
    for (const [, href] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
      if (/^[a-z]+:/i.test(href)) continue;
      assert.ok(existsSync(join(dirname(f), href)), `${relative(REPO, f)} links to missing ${href}`);
    }
    for (const [, name] of text.matchAll(/\b([a-z][a-z-]+)\.mjs\b/g)) {
      assert.ok(existsSync(join(SKILL, 'scripts', `${name}.mjs`)), `${relative(REPO, f)} mentions missing ${name}.mjs`);
    }
  }
});

test('the skill, the package and the changelog agree on the version', () => {
  const version = read(join(SKILL, 'VERSION')).trim();
  assert.match(version, /^\d+\.\d+\.\d+$/);
  assert.equal(JSON.parse(read(join(REPO, 'package.json'))).version, version);
  assert.match(read(join(REPO, 'CHANGELOG.md')), new RegExp(`^## ${version.replaceAll('.', '\\.')}\\b`, 'm'));
});

test('the tool versions are pinned exactly and the lock matches', () => {
  const deps = join(SKILL, 'deps');
  const pin = JSON.parse(read(join(deps, 'package.json'))).dependencies['playwright-core'];
  assert.match(pin, /^\d+\.\d+\.\d+$/, 'playwright-core is pinned to an exact version');
  const lock = JSON.parse(read(join(deps, 'package-lock.json')));
  assert.equal(lock.packages['node_modules/playwright-core'].version, pin);
  assert.ok(lock.packages['node_modules/playwright-core'].integrity, 'the lock carries an integrity hash');
  for (const f of ['requirements.txt', 'requirements-tts.txt']) {
    const lines = read(join(deps, f)).split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
    assert.ok(lines.length, `${f} is empty`);
    for (const l of lines) assert.match(l, /^[A-Za-z0-9_.-]+==[\w.]+$/, `${f}: ${l} is not pinned with ==`);
  }
});

test('the engine floor covers the pinned playwright-core', () => {
  const lock = JSON.parse(read(join(SKILL, 'deps', 'package-lock.json')));
  const need = Number(/\d+/.exec(lock.packages['node_modules/playwright-core'].engines.node)[0]);
  const floor = Number(/\d+/.exec(JSON.parse(read(join(REPO, 'package.json'))).engines.node)[0]);
  assert.ok(floor >= need, `package.json engines ${floor} < playwright-core's ${need}`);
});
