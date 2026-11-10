# promo-video-kit

用网页做产品宣传片：每个场景是 HTML，`window.render(t)` 只按时间摆好一整帧，无头 Edge / Chrome 逐帧截图，
ffmpeg 编成 MP4。配一个给 agent 用的 skill（`product-promo-video`），agent 按它的流程写分镜、写页面、机检、审片、出片。

两种片型（旁白实录片、纯音乐动效片），八个可切换的风格加自定义风格，品牌层，合成配乐，任意画幅。

同一个仓库里还有两个配套 skill，共用同一套工具目录：

| skill | 做什么 |
|---|---|
| `product-promo-video` | 宣传片、讲解片、发布片：HTML 逐帧渲染成 MP4，带旁白或配乐 |
| `demo-screen-recording` | 录真实操作：Playwright 驱动网页（包括要点审批按钮、等 agent 跑完的聊天类应用），出 WebM/MP4 和逐步截图；录下来的素材可以直接给宣传片的旁白实录片用 |
| `html-briefing-deck` | 汇报幻灯片：单个 HTML 文件，逐页截图并检查版式 |

## 它由哪几块组成

| 部分 | 在哪 | 换机器时 |
|---|---|---|
| skills：各自独立的 skill 流程、模板、风格、脚本 | `skills/<skill-name>/` | `install` 一次装好全部（`--skill` 只装其中几个） |
| 工具：playwright-core、带 ffmpeg 和 edge-tts 的 Python 虚拟环境 | 工具目录，默认 `~/.promo-tools`，所有项目共用 | 用 `setup` 按锁定版本装；不要拷贝 |
| 机器本身 | Node 20+、Python 3.10+、Edge 或 Chrome、中文字体 | 预先装好 |

宣传视频工具版本锁定在 `skills/product-promo-video/deps/`，所以每台机器装出来的一样。工具目录按这个顺序找：`PROMO_TOOLS`，
当前目录或上级目录里的 `.promo-tools`，最后是 `~/.promo-tools`。

## 在一台新机器上用（有网）

```bash
git clone <本仓库> promo-video-kit      # 或者直接拷整个文件夹
cd promo-video-kit
node bin/promo.mjs install             # 全部 skill → 这台机器上已有的每个 agent（原有的先备份）
node bin/promo.mjs setup               # 工具 → ~/.promo-tools，最后自动跑 doctor
```

`doctor` 全是 `ok` 就能用了。然后在任意项目里对 agent 说“做一个产品宣传片”，它会按 skill 走。

`install` 认识这几个 agent，不写 `--agent` 时只装进家目录里已经存在的那些：

| `--agent` | 装到 | 谁会读 | 什么时候算"已有" |
|---|---|---|---|
| `cursor` | `~/.cursor/skills/` | Cursor | 有 `~/.cursor` |
| `claude` | `~/.claude/skills/`（设了 `CLAUDE_CONFIG_DIR` 就装到它下面） | Claude Code | 有该目录 |
| `codex`（别名 `agents`） | `~/.agents/skills/` | Codex，以及其他读这个共用目录的 agent | 有 `~/.codex` 或 `~/.agents` |
| `copilot` | `~/.copilot/skills/` | GitHub Copilot CLI | 有 `~/.copilot` |

`--agent cursor,claude` 只装这几个，`--agent all` 全装，`--skill demo-screen-recording,html-briefing-deck` 只装这几个 skill，
`--list` 看每个位置装的是哪个版本。所有位置都是同一份 skill 的副本（不带 `node_modules`），升级后重新 `install` 一次。

录屏和幻灯片检查要用 playwright-core：先找 skill 自己的 `node_modules`，再找 `setup` 装好的工具目录，所以跑过 `setup`
就不用再在 skill 里 `npm install`。录屏还要 Playwright 自己的编码器，每台机器装一次：
`node ~/.promo-tools/node_modules/playwright-core/cli.js install ffmpeg`。

- Codex 从 `~/.agents/skills/` 读用户级 skill，不再用 `~/.codex/skills/`；两处都放会在 Codex 里出现两次，
  所以装 `codex` 时会把 `~/.codex/skills/` 里的旧副本备份后移走（`--list` 会提示）。
- Copilot CLI 的位置按它的文档写，还没在这台机器上实测过；装完在 Copilot 里确认能看到这个 skill。
  它也可能同时读 `~/.claude/skills/`，如果看到两份，`install --agent cursor,claude,codex` 不装它即可。
只做纯音乐的动效片、不要旁白时，`setup --no-tts` 可以不装 edge-tts。

## 没有网的机器

在一台**同系统、同 CPU、同一个 Python 小版本**、有网的机器上打包（ffmpeg 和 aiohttp 是平台相关的二进制 wheel）：

```bash
node bin/promo.mjs setup --pack D:/promo-offline     # 约 45 MB：npm 包、wheel、全部 skill、bundle.json
```

把 `D:/promo-offline` 整个拷过去，在目标机器上：

```bash
cd D:/promo-offline
node skills/product-promo-video/scripts/setup.mjs --from .
node skills/product-promo-video/scripts/install.mjs
```

平台或 Python 版本对不上时 `setup --from` 会直接说明，不会装一半。旁白（edge-tts）合成时仍要联网；
纯配乐的片子全程离线。离线包里没有 Playwright 录屏用的编码器，要录屏时把有网机器上 `ms-playwright/ffmpeg-*` 目录一起拷过去。

## 命令

`node bin/promo.mjs <命令> [参数]`，参数和对应 skill 的 `scripts/<脚本>.mjs` 一样。
想直接敲 `promo`，在仓库里运行一次 `npm link`。

| 命令 | 做什么 |
|---|---|
| `setup` | 装工具（锁定版本）；`--pack <dir>` 写离线包，`--from <dir>` 离线安装，`--no-tts` 不装旁白 |
| `doctor` | 检查 Node、工具版本、浏览器、ffmpeg 编码器、中文字体、旁白；`--json` |
| `install` | 把全部 skill 装进 agent 的 skill 目录；`--agent cursor,claude,codex,copilot\|all`，`--skill <名字>,…`，`--list`，`--target <dir>`，`--link` 开发用 |
| `init` | 建片子目录：`--cut motion\|narrated\|patterns --style <风格> [--brand]`；`--new-style` 做自己的风格 |
| `analyze` | 拆参考视频：时长、缩略图、关键帧 |
| `tts` | 旁白脚本 → 配音和 `timeline.json` |
| `styleboard` | 同几个场景在几个风格下的对照图 |
| `render` | `--preview 1,4.5` 出静帧，或全量渲染 `--out out/片名.mp4` |
| `check` | 机检：阅读时间、字号、对比度、空镜、静止、漂移、安全区、无声 |
| `review` | 审片图（关键时刻、切点、手机尺寸）和 `REVIEW.md` |
| `music` / `mix` | 合成配乐与音效 / 旁白与配乐混音 |
| `verify` | 验收成片：时长、编码、响度、true peak、低频占比 |
| `record` | 录屏（demo-screen-recording）：`FLOW=<flow.json>` 加 `record <skill>/scenarios/flow.mjs out.webm\|out.mp4` |
| `deck` | 检查幻灯片（html-briefing-deck）：`deck <deck.html> [outDir]`，逐页截图和版式问题 |

完整流程和每个参数见各 skill 的 SKILL.md：[宣传片](skills/product-promo-video/SKILL.md)、
[录屏](skills/demo-screen-recording/SKILL.md)、[幻灯片](skills/html-briefing-deck/SKILL.md)。

## 目录

```
bin/promo.mjs                        命令入口（转给各 skill 的脚本）
skills/                              每个子目录是一个独立、可安装的 skill，各有 SKILL.md 和 VERSION
  product-promo-video/               宣传片
    SKILL.md                         agent 读的入口：工作流、命令、页面约定、硬规则
    craft.md styles.md review.md …   创作、风格、审片的细则
    scripts/                         setup doctor install init render check review music mix verify …
    templates/                       kit.js / kit.css 和三套起步模板、品牌层
    styles/<slug>/                   八个风格；_template 是新风格的起点
    deps/                            锁定的工具版本（三个 skill 共用）
  demo-screen-recording/             录屏
    scripts/record.mjs               录屏运行器
    scenarios/flow.mjs               按流程 JSON 驱动页面
    examples/                        页面导览、聊天 agent 两个流程模板
  html-briefing-deck/                汇报幻灯片
    assets/template.html             幻灯片骨架
    scripts/check.mjs                逐页截图和版式检查
tests/run.mjs                        跑一套测试（unit 或 e2e）
tests/unit/                        不需要浏览器的测试
tests/e2e/                         整条管线：init → 预览 → 机检 → 审片 → 配乐 → 渲染 → 验收
```

## 开发

```bash
npm test               # 单元测试，几秒
npm run test:e2e       # 端到端，约一分钟；doctor 不通过时跳过
node bin/promo.mjs install --link   # 让 Cursor 直接用仓库里的 skill，改了立即生效
```

- 改了任何一个 skill 的模板、风格、阈值、脚本或工具版本：升 `package.json` 和每个 `skills/<skill>/VERSION` 的版本号，写进
  [CHANGELOG.md](CHANGELOG.md)，然后重新 `install`（用 `--link` 的不用）。
- 升级工具版本：改 `deps/package.json` 的版本后在 `deps/` 里运行 `npm install --package-lock-only`，改
  `requirements*.txt` 的版本；录屏和幻灯片两个 skill 的 `package.json` / `package-lock.json` 锁同一个 playwright-core 版本
  （测试会检查），跑完两套测试再提交。
- 隐私测试会扫描整个仓库里的本机路径、用户名和密钥；私有名字写在仓库外的
  `~/.promo-tools/privacy-denylist.txt`（一行一个，或用 `PROMO_PRIVACY_DENYLIST` 指定），这样名字本身不会进 git。

## 隐私

- 渲染、机检、配乐、验收都在本机完成，不上传任何东西。
- 旁白用 edge-tts 时，旁白文本会发给在线语音服务；有保密内容时先征得同意或换本地 TTS。
- 片子里的私有内容（客户名、产品名、录屏、数据）只放在各项目的片子目录里，不写回 skill。

## 许可

私有仓库，未授权给外部使用。参考过的项目与第三方依赖见 [NOTICE.md](NOTICE.md)。
