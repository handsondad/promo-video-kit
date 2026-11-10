import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, relative, sep } from 'node:path';
import { test } from 'node:test';
import { PALETTES } from '../../skills/product-promo-video/scripts/music.mjs';
import { ALL_SKILLS, REPO, SKILL, walk } from '../helpers.mjs';

const read = (p) => readFileSync(p, 'utf8');
const all = ALL_SKILLS.flatMap((dir) => walk(dir));
const of = (dir) => all.filter((f) => f.startsWith(dir + sep));

test('the kit ships the three skills', () => {
  const names = ALL_SKILLS.map((d) => basename(d)).sort();
  for (const n of ['demo-screen-recording', 'html-briefing-deck', 'product-promo-video']) assert.ok(names.includes(n), n);
});

test('every script parses', () => {
  const scripts = [...all.filter((f) => /\.m?js$/.test(f)), ...walk(join(REPO, 'bin'))];
  for (const f of scripts) {
    const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
    assert.equal(r.status, 0, `${relative(REPO, f)}: ${r.stderr}`);
  }
});

// The subset of YAML a SKILL.md header uses. A plain (unquoted, single-line) value must not hold ": " or " #": a strict
// YAML parser rejects the first and cuts the value at the second, and the agent then sees no description at all.
function frontmatter(text) {
  const head = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.ok(head, 'frontmatter');
  const out = {};
  const lines = head[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const m = /^([a-z-]+):(?: (.*))?$/.exec(lines[i]);
    assert.ok(m, `frontmatter line ${i + 1} is not "key: value": ${lines[i]}`);
    const [, key, raw = ''] = m;
    if (/^[>|][-+]?$/.test(raw.trim())) {
      const block = [];
      while (i + 1 < lines.length && /^\s+\S|^\s*$/.test(lines[i + 1])) block.push(lines[++i].trim());
      out[key] = block.join(' ').trim();
    } else if (/^["']/.test(raw)) {
      out[key] = raw.slice(1, -1);
    } else {
      assert.ok(!/: | #/.test(raw), `frontmatter ${key}: a plain value with ": " or " #" breaks YAML; use "${key}: >-" and indent the text`);
      assert.ok(!/^[[\]{}&*!%@`]/.test(raw), `frontmatter ${key}: a plain value cannot start with ${raw[0]}`);
      out[key] = raw.trim();
    }
  }
  return out;
}

test('every SKILL.md frontmatter loads in every agent: valid YAML, known keys, its own name, a short description', () => {
  for (const dir of ALL_SKILLS) {
    const where = relative(REPO, join(dir, 'SKILL.md'));
    const head = frontmatter(read(join(dir, 'SKILL.md')));
    for (const k of Object.keys(head)) assert.ok(['name', 'description', 'license', 'allowed-tools', 'metadata'].includes(k), `${where}: frontmatter key ${k}`);
    assert.equal(head.name, basename(dir), `${where}: name`);
    assert.ok(head.description, `${where}: description`);
    const bytes = Buffer.byteLength(head.description);
    assert.ok(bytes <= 512, `${where}: description is ${bytes} bytes; agents list every skill's description, keep it ≤ 512`);
  }
});

test('the frontmatter check rejects a plain description with a colon', () => {
  assert.throws(() => frontmatter('---\nname: x\ndescription: Records with Playwright: tours\n---\n'), /breaks YAML/);
  assert.equal(frontmatter('---\nname: x\ndescription: >-\n  Records with Playwright: tours\n---\n').description, 'Records with Playwright: tours');
});

test('inline code in the docs survives Claude Code skill loading (no ! and no > before a word)', () => {
  for (const f of all.filter((f) => f.endsWith('.md'))) {
    const text = read(f).replace(/^```[\s\S]*?^```/gm, '');
    for (const [code] of text.matchAll(/`[^`\n]+`/g)) assert.ok(!/!|>\w/.test(code), `${relative(REPO, f)}: ${code}`);
  }
});

test('every JSON file parses', () => {
  for (const f of all.filter((f) => f.endsWith('.json'))) assert.doesNotThrow(() => JSON.parse(read(f)), relative(REPO, f));
});

test('the recorder and deck checker pin the playwright-core the promo tools pin', () => {
  const pin = JSON.parse(read(join(SKILL, 'deps', 'package.json'))).dependencies['playwright-core'];
  for (const dir of ALL_SKILLS.filter((d) => existsSync(join(d, 'package.json')))) {
    assert.equal(JSON.parse(read(join(dir, 'package.json'))).dependencies['playwright-core'], pin, relative(REPO, dir));
    assert.equal(JSON.parse(read(join(dir, 'package-lock.json'))).packages['node_modules/playwright-core'].version, pin, `${relative(REPO, dir)} lock`);
  }
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
  const names = new Set(all.map((f) => basename(f)));
  for (const dir of ALL_SKILLS) {
    for (const f of of(dir).filter((f) => extname(f) === '.md')) {
      const text = read(f);
      for (const [, href] of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
        if (/^[a-z]+:/i.test(href)) continue;
        assert.ok(existsSync(join(dirname(f), href)), `${relative(REPO, f)} links to missing ${href}`);
      }
      for (const [, name] of text.matchAll(/(?<![<\w-])([a-z][a-z-]+)\.mjs\b/g)) {
        assert.ok(names.has(`${name}.mjs`), `${relative(REPO, f)} mentions missing ${name}.mjs`);
      }
    }
  }
});

test('every skill, the package and the changelog agree on the version', () => {
  const version = JSON.parse(read(join(REPO, 'package.json'))).version;
  assert.match(version, /^\d+\.\d+\.\d+$/);
  for (const dir of ALL_SKILLS) assert.equal(read(join(dir, 'VERSION')).trim(), version, `${relative(REPO, dir)}/VERSION`);
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
