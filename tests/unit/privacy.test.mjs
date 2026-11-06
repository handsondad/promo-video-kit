// The skill is shared across projects, so it must not carry anything from one: local paths, secrets, or the names on
// a private deny list. The list stays outside the repo (one term per line), so the names never land in git:
// $PROMO_PRIVACY_DENYLIST, else <tools dir>/privacy-denylist.txt.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { REPO, walk } from '../helpers.mjs';

const TEXT = new Set(['.md', '.mjs', '.js', '.json', '.css', '.html', '.txt', '']);
const files = walk(REPO).filter((f) => TEXT.has(extname(f)) && !f.includes(`${join('tests', 'unit', 'privacy.test.mjs')}`));
const read = (f) => readFileSync(f, 'utf8');

test('no absolute home paths or user names', () => {
  const user = homedir().split(/[\\/]/).pop().toLowerCase();
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /[A-Za-z]:\\Users\\[^\\\s]+/, `${relative(REPO, f)} has a Windows home path`);
    assert.doesNotMatch(text, /\/(Users|home)\/[a-z][\w.-]+\//, `${relative(REPO, f)} has a home path`);
    if (user.length > 3) assert.ok(!text.toLowerCase().includes(user), `${relative(REPO, f)} mentions the local user name`);
  }
});

test('no keys or tokens', () => {
  for (const f of files) {
    const text = read(f);
    assert.doesNotMatch(text, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, relative(REPO, f));
    assert.doesNotMatch(text, /\b(sk|ghp|gho|xox[abp])[-_][A-Za-z0-9]{20,}/, relative(REPO, f));
  }
});

test('nothing from the private deny list', (t) => {
  const tools = process.env.PROMO_TOOLS ?? join(homedir(), '.promo-tools');
  const list = process.env.PROMO_PRIVACY_DENYLIST ?? join(tools, 'privacy-denylist.txt');
  if (!existsSync(list)) return t.skip(`no deny list at ${list}`);
  const terms = read(list).split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  for (const f of files) {
    const text = read(f).toLowerCase();
    for (const term of terms) assert.ok(!text.includes(term.toLowerCase()), `${relative(REPO, f)} contains a deny-listed term (line ${terms.indexOf(term) + 1} of the list)`);
  }
});
