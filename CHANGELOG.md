# 更新记录

版本号同时写在 `package.json` 和每个 `skills/<skill>/VERSION`（三个 skill 同一个版本），测试会检查它们一致、这里有对应的一节。
改了模板、风格、检查阈值或工具版本都要升版本：只修错升第三位，加功能或改阈值升第二位，改了片子目录或页面约定、
旧片子要改才能用时升第一位。

## 1.2.0 — 2026-11-10

- 仓库改成多 skill：`skill/product-promo-video/` 移到 `skills/product-promo-video/`，新加 `demo-screen-recording`（浏览器操作录屏）
  和 `html-briefing-deck`（HTML 汇报幻灯片）。以前用 `install --link` 的机器要重新 link 一次（旧链接指向已经不存在的 `skill/`）。
- `install.mjs` 在仓库或离线包里运行时装 `skills/` 下的全部 skill，`--skill <名字>,…` 只装其中几个，`--list` 逐个列出；
  在已装好的副本里运行时只装它自己。不拷 `node_modules`。`setup.mjs --pack` 把全部 skill 放进离线包。
- `promo record`、`promo deck` 两个命令分别调录屏和幻灯片检查。
- 录屏：
  - 浏览器起不来时不再留下空的截图目录和临时目录（以前下一次运行会被"拒绝覆盖"挡住）。
  - 支持 `storageState`（相对流程文件）、`locale`、`waitUntil`、`contextOptions`；页面加载默认等 `load`，不再等 `networkidle`
    （有流式连接或轮询的聊天、agent 应用永远等不到）。`timeoutMin` 在步骤之间也检查。
  - 流程 JSON 在启动浏览器之前校验：每步恰好一个动作、`agent` 必须有 `approve` 和 `done`、正则写错直接报出哪一步。
    正则字段统一接受 `"/…/flags"` 或不带斜杠的正则（以前 `agent` 里不带斜杠会报 `null.test`）。
  - 输出写 `.mp4` 时用完整 ffmpeg（`FFMPEG`、promo 工具目录里的，或 PATH 上的）转码，`.webm` 保留。
  - SKILL.md 的描述改成 YAML 折叠写法：原来单行里的 `Playwright: page tours` 让 YAML 解析失败，agent 看不到这个 skill 的描述。
    描述里写清和 product-promo-video 的分工，命令示例不再写死 `~/.agents` 路径。
- 幻灯片检查：截图每次换新文件名并删掉上一轮的（看图工具按路径缓存）；新增正文（`p`/`li`/`td`）小于 15px 的 `small-text`；
  非 Windows 默认用 Chrome；不是按模板做的页面直接说明。SKILL.md 去掉会让 Claude Code 加载出错的行内代码。
- 两个新 skill 的 playwright-core 锁定到和工具目录相同的 1.65.0，找不到自己的 `node_modules` 时用 `~/.promo-tools` 里的。
- 宣传片：`render.mjs` 全量渲染有页面报错时退出码为 1（和预览一致）；`verify.mjs` 测不出响度时报问题，不再显示 OK；
  `tts.mjs` 遇到一句旁白都没有的脚本时说明原因，不再让 ffmpeg 报 `amix=inputs=0`。`narrated.md` 的录屏改为指向 demo-screen-recording。
- 测试：frontmatter（含 YAML 写法）、行内代码、链接、脚本解析、JSON、版本号覆盖全部 skill；新增安装全部 skill、录屏失败不留目录、
  流程校验的测试。

## 1.1.0 — 2026-11-06

- `install.mjs` 认四个 agent：`cursor`、`claude`（认 `CLAUDE_CONFIG_DIR`）、`codex`（装到 Codex 读的 `~/.agents/skills`，
  别名 `agents`）、`copilot`（`~/.copilot/skills`）。不再往 `~/.codex/skills` 装：装 `codex` 时把那里的旧副本备份后移走，
  免得 Codex 里出现两次。
- SKILL.md 的描述缩到 512 字节以内（agent 会把每个 skill 的描述都放进上下文）；文档里的行内代码不再含 `!` 或紧跟字母的 `>`
  （Claude Code 加载 skill 时会出错）；测试检查这两条和 frontmatter 的键。
- 旁白：`vo` 是念的，`sub` 是显示的；tts.mjs 让 edge-tts 输出句子边界，字幕按真实发音逐句换，不再按字数估算；
  警告漏写 `sub` 的汉字读数和过快、过慢的语速。
- 字幕和 `.foot` 免责小字不再重叠（共用底部一条带，竖屏同样）；字幕按画面宽度折行。
- `check.mjs` 新增 `text_overlap`、`media_missing`、`media_soft`、`shot_treated`、`not_deterministic`。
- 音频：`music.mjs --sfx` 把音效单独一轨；`mix.mjs` 只让垫乐闪避，给 `--timeline` 时按旁白时间提前压下 14 dB，
  人声先过压缩；两遍线性响度归一（必要时先只削峰），不写 `--voice` 就是动效片的母带。
- 风格：terminal 的录屏不再被滤镜染色（只改外框）；editorial 的警示色加深到能读；keynote 的字幕不再小一号。
- 数字计数用等宽数字，最后一帧是精确的目标值。
- 修正：timeline 里删掉的场景（做短版时）以前整片都留在画面上，盖在其他场景上；`K.film` 现在把它们藏起来。
  `text_overlap` 加上后才发现。
- craft.md：需求确认、逐字锁定、改片纪律、一个母版多个版本、数据动效、光标、界面保真、取素材时脱敏、发布状态、
  标题字号分档、投影下限、默认字体黑名单、授权曲剪辑。

## 1.0.0 — 2026-11-06

第一次作为独立工程发布。之前这个 skill 只在一台机器的 skill 目录里，没有版本。

- 工程：git 仓库、`promo` 命令、单元测试和端到端测试、README、NOTICE。
- 工具版本锁定在 `skills/product-promo-video/deps/`（playwright-core 1.65.0、imageio-ffmpeg 0.8.1、edge-tts 7.3.1）；
  `setup.mjs` 只装缺的或版本不对的。
- 离线：`setup.mjs --pack <dir>` 在有网的机器上写离线包（包、wheel 和一份 skill），`--from <dir>` 在没网的机器上装。
- `doctor.mjs`：检查 Node、工具版本、浏览器、ffmpeg 编码器、中文字体、旁白。
- `install.mjs`：把 skill 装进 Cursor、Claude Code、共用的 `~/.agents`、Codex 的 skill 目录（默认只装已存在的 agent），
  原有的先备份；`--list` 查看各处版本，`--link` 供开发用。
- `init.mjs` 再次运行时保留片子已记录的风格，并刷新片子目录里已有的所有风格（以前会把风格重置成 nebula，
  其它风格的副本也不会更新）。
- 修正：cue 写 `"end+0.5"` 时，有叫 `end` 的场景就按这个场景算。以前一律按整片结尾算，动效模板片尾卡的冲击音和
  呼吸段落到片子之外，被静默丢掉。
- 已有功能：旁白实录片、动效片和更多章节版式三套模板，八个风格和自定义风格，品牌层，七种声音调色板，
  `check.mjs` 机检、`review.mjs` 审片图，`verify.mjs` 验收。
