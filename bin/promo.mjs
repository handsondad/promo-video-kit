#!/usr/bin/env node
// promo <command> [args]: runs the skill's scripts from this checkout, with the same arguments as
// `node <skill>/scripts/<script>.mjs`, in the current directory.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = join(dirname(dirname(fileURLToPath(import.meta.url))), 'skill', 'product-promo-video');
const COMMANDS = {
  setup: ['setup', '安装工具（锁定版本）；--pack <dir> 写离线包，--from <dir> 离线安装'],
  doctor: ['doctor', '检查这台机器能不能出片'],
  install: ['install', '把 skill 装进各 agent 的 skill 目录（--agent cursor,claude,codex,copilot|all，--list）'],
  init: ['init', '建片子目录：kit、模板、风格（--cut --style --brand）；--new-style 做自己的风格'],
  analyze: ['analyze-reference', '拆参考视频：info.json、缩略图、关键帧'],
  tts: ['tts', '旁白脚本 → 配音、timeline.json'],
  styleboard: ['styleboard', '同一场景在几个风格下的对照图'],
  render: ['render', '预览（--preview）或全量渲染成 MP4'],
  check: ['check', '机检：阅读时间、字号、对比、空镜、静止、漂移、安全区'],
  review: ['review', '审片图（beats、cuts、手机）和 REVIEW.md'],
  music: ['music', '按 cues 合成配乐和音效'],
  mix: ['mix', '旁白和配乐混音（自动闪避）'],
  verify: ['verify', '验收成片：时长、编码、响度、true peak、低频'],
};

const [cmd, ...rest] = process.argv.slice(2);
const version = readFileSync(join(SKILL, 'VERSION'), 'utf8').trim();
if (cmd === '--version' || cmd === '-v') {
  console.log(version);
  process.exit(0);
}
if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h' || !COMMANDS[cmd]) {
  if (cmd && !['help', '--help', '-h'].includes(cmd)) console.error(`unknown command: ${cmd}\n`);
  console.log(`promo ${version} — skill at ${SKILL}\n\nusage: promo <command> [args]\n`);
  for (const [name, [, what]] of Object.entries(COMMANDS)) console.log(`  ${name.padEnd(11)} ${what}`);
  console.log('\nArguments are those of the script; see skill/product-promo-video/SKILL.md.');
  process.exit(cmd && !['help', '--help', '-h'].includes(cmd) ? 2 : 0);
}
const r = spawnSync(process.execPath, [join(SKILL, 'scripts', `${COMMANDS[cmd][0]}.mjs`), ...rest], { stdio: 'inherit' });
process.exit(r.status ?? 1);
