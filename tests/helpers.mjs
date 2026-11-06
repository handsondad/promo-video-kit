import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
export const SKILL = join(REPO, 'skill', 'product-promo-video');
export const SCRIPTS = join(SKILL, 'scripts');

// Runs a skill script with node; env adds to (or with undefined, removes from) the current environment.
export function node(script, args = [], { cwd = REPO, env = {} } = {}) {
  const merged = { ...process.env, ...env };
  for (const [k, v] of Object.entries(env)) if (v === undefined) delete merged[k];
  const file = script.endsWith('.mjs') && !script.includes('/') && !script.includes('\\') ? join(SCRIPTS, script) : script;
  return spawnSync(process.execPath, [file, ...args], { cwd, env: merged, encoding: 'utf8', maxBuffer: 1 << 26 });
}

export function scratch(t, prefix = 'promo-test-') {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function walk(dir, skip = new Set(['.git', 'node_modules'])) {
  return readdirSync(dir).flatMap((name) => {
    if (skip.has(name)) return [];
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p, skip) : [p];
  });
}
