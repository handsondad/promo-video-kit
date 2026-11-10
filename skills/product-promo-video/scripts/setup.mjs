// Tool setup in $PROMO_TOOLS (default ~/.promo-tools, shared by every project), at the versions pinned in deps/:
// playwright-core (drives the installed Edge/Chrome) and a Python venv with imageio-ffmpeg (a full ffmpeg) and edge-tts.
// Safe to re-run: only what is missing or at another version is installed. Ends with doctor.mjs.
//   node setup.mjs [--no-tts]              install from the npm and PyPI registries
//   node setup.mjs --pack <dir> [--no-tts] then write an offline bundle there: the packages plus a copy of the kit's skills
//   node setup.mjs --from <dir>            install from such a bundle, without network
// A bundle fits only the OS, CPU and Python minor version it was packed on (ffmpeg and aiohttp ship binary wheels).
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { PINNED, SKILL, TOOLS, VERSION, WIN, arg, installedPlaywright, kitSkills, python, readJson, run } from './lib.mjs';

const DEPS = join(SKILL, 'deps');
const packDir = typeof arg('pack') === 'string' ? resolve(arg('pack')) : null;
const fromDir = typeof arg('from') === 'string' ? resolve(arg('from')) : null;
if (arg('pack') === true || arg('from') === true) throw new Error('--pack and --from need a directory');
if (packDir && fromDir) throw new Error('use --pack on a machine with network, --from on the one without');

const bundle = fromDir ? readBundle(fromDir) : null;
const tts = bundle ? bundle.tts && arg('no-tts') !== true : arg('no-tts') !== true;
const reqs = [join(DEPS, 'requirements.txt'), ...(tts ? [join(DEPS, 'requirements-tts.txt')] : [])];

const step = (msg) => console.log(`\n== ${msg}`);
const must = (r, what) => { if (r.status !== 0) { console.error(r.stdout ?? '', r.stderr ?? ''); throw new Error(`${what} failed`); } };

function npm(args, opts = {}) {
  const home = dirname(process.execPath);
  const cli = [process.env.npm_execpath, join(home, 'node_modules/npm/bin/npm-cli.js'), join(home, '../lib/node_modules/npm/bin/npm-cli.js')]
    .find((p) => p && p.endsWith('npm-cli.js') && existsSync(p));
  if (cli) return run(process.execPath, [cli, ...args], opts);
  return WIN ? run('cmd.exe', ['/d', '/c', 'npm', ...args], opts) : run('npm', args, opts);
}

const tar = WIN ? join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
const pyMinor = (py) => run(py, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])']).stdout.trim();
const norm = (name) => name.toLowerCase().replaceAll('_', '-');
const pins = (files) => files.flatMap((f) => readFileSync(f, 'utf8').split(/\r?\n/))
  .map((l) => l.replace(/#.*/, '').trim().split('==')).filter(([n, v]) => n && v);

function readBundle(dir) {
  const p = join(dir, 'bundle.json');
  if (!existsSync(p)) throw new Error(`${dir} has no bundle.json; write one with setup.mjs --pack on a machine with network`);
  const b = readJson(p);
  if (b.platform !== process.platform || b.arch !== process.arch) {
    throw new Error(`the bundle was packed on ${b.platform}-${b.arch}; this machine is ${process.platform}-${process.arch}. Pack one on a matching machine.`);
  }
  if (b.playwright !== PINNED) throw new Error(`the bundle has playwright-core ${b.playwright}, this skill pins ${PINNED}; use the skill copy inside the bundle (skills/)`);
  return b;
}

mkdirSync(TOOLS, { recursive: true });
step(`tools dir ${TOOLS}${fromDir ? ` (offline, from ${fromDir})` : ''}`);
const own = join(TOOLS, 'package.json');
if (existsSync(own) && readJson(own).name !== 'promo-tools') throw new Error(`${own} belongs to another project; point PROMO_TOOLS at an empty folder`);
for (const f of ['package.json', 'package-lock.json']) cpSync(join(DEPS, f), join(TOOLS, f));

if (installedPlaywright() !== PINNED) {
  step(`playwright-core ${PINNED}`);
  if (fromDir) {
    const tgz = join(fromDir, 'npm', `playwright-core-${PINNED}.tgz`);
    if (!existsSync(tgz)) throw new Error(`${tgz} missing from the bundle`);
    const tmp = join(TOOLS, `.unpack-${process.pid}`);
    mkdirSync(tmp, { recursive: true });
    must(run(tar, ['-xzf', tgz, '-C', tmp]), 'unpack playwright-core');
    const target = join(TOOLS, 'node_modules', 'playwright-core');
    rmSync(target, { recursive: true, force: true });
    mkdirSync(dirname(target), { recursive: true });
    renameSync(join(tmp, 'package'), target);
    rmSync(tmp, { recursive: true, force: true });
  } else {
    must(npm(['ci', '--no-audit', '--no-fund'], { cwd: TOOLS, stdio: 'inherit' }), 'npm ci');
  }
}

if (!python()) {
  step('python venv');
  const candidates = WIN ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]];
  const found = candidates.find(([bin, pre]) => { try { return run(bin, [...pre, '--version']).status === 0; } catch { return false; } });
  if (!found) throw new Error('Python 3 not found; install Python 3.10 or newer, or set FFMPEG to a full ffmpeg and skip narration.');
  must(run(found[0], [...found[1], '-m', 'venv', join(TOOLS, 'venv')], { stdio: 'inherit' }), 'venv');
}
const py = python();
const [pyMaj, pyMin] = pyMinor(py).split('.').map(Number);
if (pyMaj < 3 || (pyMaj === 3 && pyMin < 10)) {
  throw new Error(`the venv runs Python ${pyMinor(py)}; the pinned ffmpeg wheel needs 3.10 or newer. Install it, delete ${join(TOOLS, 'venv')}, and run again.`);
}
if (bundle && bundle.python !== pyMinor(py)) {
  throw new Error(`the bundle has wheels for Python ${bundle.python}; the venv runs ${pyMinor(py)}. Install that Python, delete ${join(TOOLS, 'venv')}, and run again.`);
}

const have = new Map(run(py, ['-m', 'pip', 'freeze', '--disable-pip-version-check']).stdout.split(/\r?\n/)
  .map((l) => l.split('==')).filter(([, v]) => v).map(([n, v]) => [norm(n), v]));
const missing = pins(reqs).filter(([n, v]) => have.get(norm(n)) !== v);
if (missing.length) {
  step(`pip install ${missing.map(([n, v]) => `${n}==${v}`).join(' ')}`);
  const offline = fromDir ? ['--no-index', '--find-links', join(fromDir, 'wheels')] : [];
  must(run(py, ['-m', 'pip', 'install', '-q', '--disable-pip-version-check', ...offline, ...reqs.flatMap((r) => ['-r', r])], { stdio: 'inherit' }), 'pip install');
}

if (packDir) {
  step(`offline bundle ${packDir}`);
  rmSync(packDir, { recursive: true, force: true });
  mkdirSync(join(packDir, 'npm'), { recursive: true });
  must(npm(['pack', `playwright-core@${PINNED}`, '--pack-destination', join(packDir, 'npm')], { stdio: 'inherit' }), 'npm pack');
  must(run(py, ['-m', 'pip', 'download', '-q', '--disable-pip-version-check', '-d', join(packDir, 'wheels'), ...reqs.flatMap((r) => ['-r', r])], { stdio: 'inherit' }), 'pip download');
  for (const s of kitSkills()) cpSync(s, join(packDir, 'skills', basename(s)), { recursive: true, filter: (p) => basename(p) !== 'node_modules' });
  const info = { skill: VERSION, playwright: PINNED, platform: process.platform, arch: process.arch, python: pyMinor(py), tts, packed: new Date().toISOString() };
  writeFileSync(join(packDir, 'bundle.json'), `${JSON.stringify(info, null, 2)}\n`);
  const here = `skills/${basename(SKILL)}/scripts`;
  writeFileSync(join(packDir, 'README.txt'), [
    `promo 离线安装包 · skill ${VERSION} · ${process.platform}-${process.arch} · Python ${info.python}`,
    '',
    '目标机器先装好 Node 20+、同一个小版本的 Python 和 Edge 或 Chrome，然后在本目录运行：',
    `  node ${here}/setup.mjs --from .`,
    `  node ${here}/install.mjs`,
    '',
    tts ? '旁白（edge-tts）合成时仍要联网，旁白文本会发给在线语音服务；纯配乐的片子不需要网络。' : '这个包不含旁白（--no-tts）。',
    '',
  ].join(WIN ? '\r\n' : '\n'));
  console.log(`  ${readdirSync(join(packDir, 'wheels')).length} wheels, playwright-core ${PINNED}, skill ${VERSION}`);
}

step('doctor');
const r = run(process.execPath, [join(SKILL, 'scripts', 'doctor.mjs')], { stdio: 'inherit' });
process.exit(r.status ?? 1);
