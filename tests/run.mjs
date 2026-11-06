// node tests/run.mjs unit|e2e — runs every *.test.mjs in that folder (node --test takes no directories on every version).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const suite = process.argv[2] ?? 'unit';
const dir = join(dirname(fileURLToPath(import.meta.url)), suite);
const files = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => join(dir, f));
const flags = suite === 'e2e' ? ['--test-concurrency=1'] : [];
const r = spawnSync(process.execPath, ['--test', ...flags, ...process.argv.slice(3), ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
