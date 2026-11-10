// Install the kit's skills into agents' skill folders so each agent finds them by name. The tools are separate (setup.mjs).
//   node install.mjs [--agent cursor,claude,codex,copilot | all] [--skill <name>,… | all] [--target <skills dir>] [--link] [--list]
// Run from the kit (the repo or an offline bundle) it installs every skill in its skills/ folder, or those named with
// --skill; run from an installed copy it installs just this skill. Without --agent it installs for every agent whose
// home folder exists on this machine. A copy already there is backed up to <tools dir>/backup/ first. --link makes the
// agent's folder point at the source instead of copying it (a junction on Windows), for working on a skill: edits show
// up at once. --list shows what is installed where. node_modules folders are not copied.
// Codex reads user skills from ~/.agents/skills (shared with other agents that read it), so `agents` is the same target;
// a copy left in ~/.codex/skills would make Codex list a skill twice, so installing for Codex moves it out.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { SKILL, TOOLS, VERSION, WIN, arg, kitSkills, run } from './lib.mjs';

const HOME = homedir();
const CLAUDE = process.env.CLAUDE_CONFIG_DIR || join(HOME, '.claude');
const AGENTS = {
  cursor: { name: 'Cursor', dir: join(HOME, '.cursor', 'skills'), homes: [join(HOME, '.cursor')] },
  claude: { name: 'Claude Code', dir: join(CLAUDE, 'skills'), homes: [CLAUDE] },
  codex: { name: 'Codex (and others reading ~/.agents)', dir: join(HOME, '.agents', 'skills'), homes: [join(HOME, '.codex'), join(HOME, '.agents')] },
  copilot: { name: 'GitHub Copilot CLI', dir: join(HOME, '.copilot', 'skills'), homes: [join(HOME, '.copilot')] },
};
const ALIASES = { agents: 'codex' };
const LEGACY_CODEX = join(HOME, '.codex', 'skills');
const same = (a, b) => (WIN ? a.toLowerCase() === b.toLowerCase() : a === b);
const stat = (p) => { try { return lstatSync(p); } catch { return null; } };
const versionAt = (dir) => (existsSync(join(dir, 'VERSION')) ? readFileSync(join(dir, 'VERSION'), 'utf8').trim() : 'unversioned');
const describe = (dest) => { const s = stat(dest); return !s ? '—' : s.isSymbolicLink() ? `link → ${realpathSync(dest)}` : versionAt(dest); };

function chosenSkills() {
  const all = kitSkills();
  const wanted = arg('skill');
  if (wanted === undefined || wanted === 'all') return all;
  const names = String(wanted).split(',').map((s) => s.trim()).filter(Boolean);
  for (const n of names) if (!all.some((d) => basename(d) === n)) throw new Error(`--skill ${n}: expected ${all.map((d) => basename(d)).join(' | ')} or all`);
  return all.filter((d) => names.includes(basename(d)));
}

function targets() {
  if (typeof arg('target') === 'string') return [{ key: 'target', name: 'custom', dir: resolve(arg('target')) }];
  const wanted = arg('agent');
  const keys = wanted === 'all' ? Object.keys(AGENTS)
    : typeof wanted === 'string' ? wanted.split(',').map((s) => s.trim()).filter(Boolean).map((k) => ALIASES[k] ?? k)
      : Object.keys(AGENTS).filter((k) => AGENTS[k].homes.some((h) => existsSync(h)));
  for (const k of keys) if (!AGENTS[k]) throw new Error(`--agent ${k}: expected ${Object.keys(AGENTS).join(' | ')} or all, or pass --target <skills dir>`);
  if (!keys.length) throw new Error(`no agent folder found under ${HOME}; name one with --agent, or pass --target <skills dir>`);
  return [...new Set(keys)].map((key) => ({ key, ...AGENTS[key] }));
}

// Moves what is at dest out of the way: a link is just removed, a folder is archived first.
function clear(dest, key) {
  const s = stat(dest);
  if (!s) return null;
  if (s.isSymbolicLink()) { rmSync(dest, { force: true }); return 'a link'; }
  const old = versionAt(dest), name = basename(dest);
  const d = new Date(), p2 = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`;
  const backups = join(TOOLS, 'backup');
  mkdirSync(backups, { recursive: true });
  const archive = join(backups, `${name}-${key}-${old}-${stamp}.tar.gz`);
  const tar = WIN ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  const r = run(tar, ['-czf', archive, '-C', resolve(dest, '..'), name]);
  if (r.status !== 0) throw new Error(`backup of ${dest} failed, nothing changed there: ${r.stderr}`);
  rmSync(dest, { recursive: true, force: true });
  return `${old}, backed up to ${archive}`;
}

const skills = chosenSkills();

if (arg('list') === true) {
  for (const src of skills) {
    const name = basename(src);
    for (const [key, a] of Object.entries(AGENTS)) {
      const dest = join(a.dir, name);
      console.log(`${key.padEnd(8)} ${describe(dest).padEnd(14)} ${dest}`);
    }
    const legacy = join(LEGACY_CODEX, name);
    if (stat(legacy)) console.log(`warning: ${legacy} (${describe(legacy)}) duplicates the codex entry; install --agent codex moves it out`);
  }
  process.exit(0);
}

const link = arg('link') === true;
const skipModules = (src) => basename(src) !== 'node_modules';
for (const t of targets()) {
  for (const src of skills) {
    const name = basename(src);
    const dest = join(t.dir, name);
    if (same(resolve(dest), resolve(src))) {
      console.log(`${t.key}: ${dest} is this skill already`);
      continue;
    }
    const was = clear(dest, t.key);
    mkdirSync(t.dir, { recursive: true });
    if (link) symlinkSync(src, dest, WIN ? 'junction' : 'dir');
    else cpSync(src, dest, { recursive: true, filter: skipModules });
    console.log(`${t.key}: ${link ? 'linked' : 'installed'} ${name} ${versionAt(src)} → ${dest}${was ? `\n  replaced ${was}` : ''}`);
    if (t.key === 'codex') {
      const legacy = join(LEGACY_CODEX, name);
      const gone = !same(resolve(legacy), resolve(src)) && clear(legacy, 'codex-legacy');
      if (gone) console.log(`  removed the duplicate in ${LEGACY_CODEX} (${gone}); Codex reads ${t.dir}`);
    }
  }
}
console.log(`kit ${VERSION}; tools: node ${join(SKILL, 'scripts', 'doctor.mjs').replaceAll('\\', '/')}  (setup.mjs installs what is missing)`);
