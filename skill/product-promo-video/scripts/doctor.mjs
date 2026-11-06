// Check that this machine can make films: Node, the pinned tools, a browser, a full ffmpeg, Chinese fonts, narration.
//   node doctor.mjs [--json]
// Exits 1 when something the renderer needs is missing; narration (edge-tts) is optional and only warns.
import { existsSync } from 'node:fs';
import { PINNED, SKILL, TOOLS, VERSION, arg, ffmpeg, hasEncoders, installedPlaywright, launch, python, run } from './lib.mjs';

const rows = [];
const add = (name, status, detail, fix = '') => rows.push({ name, status, detail, fix });
const SETUP = `node ${SKILL.replaceAll('\\', '/')}/scripts/setup.mjs`;

const major = Number(process.versions.node.split('.')[0]);
add('node', major >= 20 ? 'ok' : 'fail', `v${process.versions.node}`, major >= 20 ? '' : 'install Node 20 or newer');
add('skill', 'ok', `${VERSION} at ${SKILL}`);
add('tools dir', existsSync(TOOLS) ? 'ok' : 'fail', TOOLS, existsSync(TOOLS) ? '' : SETUP);

const pw = installedPlaywright();
add('playwright-core', !pw ? 'fail' : pw === PINNED ? 'ok' : 'warn', pw ? `${pw}${pw === PINNED ? '' : ` (this skill pins ${PINNED})`}` : 'not installed', pw === PINNED ? '' : SETUP);

if (pw) {
  try {
    const browser = await launch();
    add('browser', 'ok', `${browser.channel} ${browser.version()}${process.env.PROMO_BROWSER ? ' (from PROMO_BROWSER)' : ''}`);
    const page = await browser.newPage();
    const cjk = await page.evaluate(() => {
      const c = document.createElement('canvas');
      c.width = 96; c.height = 40;
      const g = c.getContext('2d');
      const draw = (s) => { g.clearRect(0, 0, 96, 40); g.font = '28px sans-serif'; g.fillText(s, 4, 32); return g.getImageData(0, 0, 96, 40).data.join(); };
      return draw('宣传片') !== draw('\u{10FFFD}\u{10FFFD}\u{10FFFD}');
    });
    add('chinese fonts', cjk ? 'ok' : 'fail', cjk ? 'the browser draws Chinese glyphs' : 'Chinese renders as empty boxes', cjk ? '' : 'install a CJK font (for example Noto Sans CJK)');
    await browser.close();
  } catch (e) {
    add('browser', 'fail', String(e.message).split('\n')[0], 'install Edge or Chrome, or set PROMO_BROWSER=msedge|chrome|chromium');
  }
}

const py = python();
add('python venv', py ? 'ok' : 'fail', py ? run(py, ['--version']).stdout.trim() : 'not created', py ? '' : SETUP);

try {
  const bin = ffmpeg();
  const full = hasEncoders(bin);
  add('ffmpeg', full ? 'ok' : 'fail', `${bin}${full ? ' (libx264 + aac)' : ' lacks libx264 or aac'}`, full ? '' : SETUP);
} catch (e) {
  add('ffmpeg', 'fail', 'no full ffmpeg', process.env.FFMPEG ? 'check the FFMPEG variable' : SETUP);
}

const tts = py ? run(py, ['-c', 'import edge_tts; print(edge_tts.__version__)']) : null;
const ttsOk = tts?.status === 0;
add('edge-tts', ttsOk ? 'ok' : 'warn', ttsOk ? `${tts.stdout.trim()} (needs network while it speaks; the narration text leaves the machine)` : 'not installed; only the narrated cut needs it', ttsOk ? '' : SETUP);

const bad = rows.filter((r) => r.status === 'fail');
if (arg('json')) {
  console.log(JSON.stringify({ ok: !bad.length, rows }, null, 2));
} else {
  for (const r of rows) console.log(`${r.status.padEnd(5)} ${r.name.padEnd(16)} ${r.detail}${r.fix ? `\n      ${''.padEnd(16)} → ${r.fix}` : ''}`);
  console.log(bad.length ? `\nnot ready: ${bad.map((r) => r.name).join(', ')}` : '\nready');
}
process.exit(bad.length ? 1 : 0);
