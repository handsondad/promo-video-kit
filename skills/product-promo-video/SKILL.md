---
name: product-promo-video
description: >-
  Makes finished MP4 product promo, explainer and launch videos from HTML rendered frame by frame (headless Edge/Chrome,
  ffmpeg), with edge-tts narration or a synthesised score; narrated or motion cuts, eight styles or the user's own, any
  aspect ratio. Use for a 宣传片, 产品视频, 演示视频, promo, explainer, launch or trailer video, for turning a demo, deck or
  screenshots into a video, or for matching a reference video or a style. Raw screen capture: demo-screen-recording.
---

# 产品宣传片：HTML 逐帧渲染，多种风格

画面是一个网页，每个场景是一个 `<section>`，`window.render(t)` 只依赖时间 `t` 摆好整帧；`scripts/render.mjs`
用无头 Edge/Chrome 逐帧截图，管道送给 ffmpeg 编成 H.264 + AAC。没有 CSS 动画、没有实时录制，任意一帧可单独预览、
反复修改、结果完全可复现。

## 三个维度，各自独立

| 维度 | 选项 | 在哪定 |
|---|---|---|
| **片型**（结构与素材） | 旁白实录片 `narrated`：中文旁白 + 字幕 + 真实录屏 / 截图推近；动效片 `motion`：纯音乐、大字动效、重绘 UI、章节 | `init.mjs --cut`；细则 [narrated.md](narrated.md) / [motion.md](motion.md) |
| **风格**（长什么样、怎么动、什么声音） | `nebula` 星云玻璃、`keynote` 暗场发布会、`swiss` 瑞士网格、`blueprint` 蓝图工程、`whiteboard` 白板手绘、`terminal` 终端荧光、`editorial` 杂志纸本、`pop` 波普活力，或用户自己的 | `"style"` / `--style`；一览、选法、做自己的风格见 [styles.md](styles.md)，每个风格的规格在 `styles/<slug>/STYLE.md` |
| **画幅** | 1920×1080（默认）、1080×1920 竖屏、1080×1350 等 | timeline 的 `width` / `height`，或 `--size 1080x1920` |

片型决定讲什么、用什么素材；风格只换皮和动作，模板不用改。用户只说"做个宣传片"：先做旁白实录片（素材最真），
风格按内容推荐（不要因为 nebula 是默认值就用它）；有余力或用户要"更酷"再出动效片。无论哪种，先读 [craft.md](craft.md)
（SPEC、默认值黑名单、三条故事线、结构、文案、节奏、声音、诚信），渲染前按 [review.md](review.md) 审片。

## 工作流

```
- [ ] 1. 收集事实：产品文档/汇报材料、真实录屏与截图、真实数字及出处、必须带的免责声明、品牌规范（色值、字体、logo 文件）
- [ ] 2. 一次问清（一条消息，之后不再追问）：片型、风格候选、画幅、时长、要不要旁白、有没有参考视频和品牌素材
- [ ] 3. 有参考视频 → analyze-reference.mjs，读 sheet/keyframe 图，写"结构表 + 风格清单"，对应到最近的风格
- [ ] 4. 写 SPEC.md（把形容词变成数字，含 BANNED）和 STORYLINES.md（三条故事线：世界、手法、形式），请用户选一条
- [ ] 5. 写 TREATMENT.md（craft.md「Treatment」）：标杆、分镜表、节拍表、声音表
- [ ] 6. doctor.mjs 不全 ok 就先 setup.mjs；init.mjs 建片子目录（拷 kit、模板、风格；有品牌规范加 --brand）
- [ ] 7. 时间轴：旁白片 tts.mjs 生成；动效片手写 timeline.json
- [ ] 8. 选定风格：先写 2–3 个真实场景 → styleboard.mjs 对照候选风格 → 用户选 → 读该风格 STYLE.md → 三张风格帧自查
- [ ] 9. 写 film.html：每个场景一个 RENDER[id](l, scene)，只用风格钩子和主题变量；品牌值只写在 brand.css
- [ ] 10. 预览循环：--preview 每场景 2–3 个时刻 → 读 sheet 图 → 修 → 再预览，直到每帧都对
- [ ] 11. 审片（review.md）：check.mjs 机检 → review.mjs 出 beats / cuts / phone 图 → 填 REVIEW.md 的 P0/P1/P2 → 改一轮 → 复查
- [ ] 12. 音频：music.mjs --sfx（风格对应的 palette，每个音效都有画面原因）→ mix.mjs 混音并母带（旁白片按 timeline 闪避垫乐，音效不闪避）
- [ ] 13. 全量渲染 → verify.mjs（时长、编码、响度、true peak、低频占比）→ 读 sheet 图；对照黑名单和「不是模板的翻版」（craft.md）
- [ ] 14. 交付：路径、时长、风格、故事线、哪些是真实录屏/哪些是重绘、数字出处、音乐来源、测量过什么、保留的警告、REVIEW.md
```

片子目录放在项目里不进 git 的地方（如 `.promo/`，并加进 `.gitignore`），不要放进源码目录。

## 命令

脚本在本 skill 的 `scripts/` 下，用绝对路径调用，工作目录为当前片子目录。

```bash
node <skill>/scripts/doctor.mjs                                  # 先看这台机器缺什么；全 ok 再开工
node <skill>/scripts/setup.mjs [--no-tts]                        # 按 deps/ 锁定的版本装工具到 ~/.promo-tools，只补缺的
node <skill>/scripts/init.mjs --dir .promo/film --cut motion --style keynote [--all-styles] [--brand]   # 片子目录
node <skill>/scripts/analyze-reference.mjs ref.mp4 --out ref     # 参考视频 → info.json、sheet-N.jpg、k-<秒>.jpg
node <skill>/scripts/tts.mjs script.json                         # 旁白 → vo/*.mp3、timeline.json、vo.wav
node <skill>/scripts/styleboard.mjs --film film.html --timeline timeline.json --at 3,9,24 --styles keynote,swiss,pop
node <skill>/scripts/render.mjs --film film.html --timeline timeline.json --preview 1,4.5,12 [--style pop] [--size 1080x1920]
node <skill>/scripts/check.mjs --film film.html --timeline timeline.json [--pace calm] [--json check.json] [--strict]
node <skill>/scripts/review.mjs --film film.html --timeline timeline.json [--check check.json]   # review/ 下的审片图和 REVIEW.md
node <skill>/scripts/music.mjs --timeline timeline.json --cues cues.json --out score.wav --sfx sfx.wav [--palette motorik]
node <skill>/scripts/mix.mjs [--voice vo.wav --timeline timeline.json] --music score.wav --sfx sfx.wav --out mix.wav [--lufs -15]
node <skill>/scripts/render.mjs --film film.html --timeline timeline.json --audio mix.wav --out out/片名.mp4
node <skill>/scripts/verify.mjs out/片名.mp4 --expect 62.5
node <skill>/scripts/init.mjs --new-style my-style --name 我的风格 --from editorial          # 做自己的风格
```

- `--style` / `--size` 在 render、styleboard、check、review 上都只覆盖这一次，不改文件；定稿写进 timeline / script 的 `style`、`width`、`height`。
- `init.mjs` 不写 `--dir` 时用 `.promo/film`，不会把文件撒进当前目录。再次运行会保留片子记录的风格，并刷新 kit 和片子里已有的风格；skill 升级后对老片子跑一次。
- 换机器：只拷 skill，不拷工具目录；新机器上先 `doctor`，缺什么 `setup` 补什么。没网的机器：在同系统、同 Python 小版本、有网的机器上
  `setup.mjs --pack <dir>`，拷过去后 `setup.mjs --from <dir>`；`install.mjs` 把 skill 装进这台机器上已有的 agent
  （Cursor、Claude Code、Codex 读的 `~/.agents`、Copilot CLI；`--agent` 指定，`--list` 查看；原有的先备份）。
- 混音：`music.mjs --sfx` 把 tick / whoosh / impact 单独写一轨，`mix.mjs` 只让垫乐在旁白下闪避（给了 timeline 就按旁白时间提前 0.15 s
  压下 14 dB、0.4 s 回来，不等人声出来才反应），音效不闪避；最后两遍线性响度归一（默认 −15 LUFS、true peak −1.5 dBTP），
  不写 `--voice` 就是动效片的母带。打出 `warning: … dB of peaks limited` 时用 `--lufs -16`。
- 声音调色板：synth、mallet、motorik、felt、chip、ambient、pop；`init.mjs` 按风格写进 `cues.json` 的 `palette`，`--palette` 临时覆盖。
- 工具目录：`$PROMO_TOOLS` → 当前或上级目录的 `.promo-tools` → `~/.promo-tools`。ffmpeg 可用 `FFMPEG` 指定，浏览器用 `PROMO_BROWSER=msedge|chrome|chromium`。用户风格目录：`$PROMO_STYLES`，默认 `~/.promo-styles`。
- 渲染速度约 0.3–0.5 倍实时（1080p30）：40 s 动效片约 1.5 分钟，带录屏序列的 2 分钟旁白片约 6–7 分钟；长渲染放后台跑，完成后再验收。
- `--preview`、`styleboard` 和 `verify` 每次生成新文件名的图（看图工具按路径缓存，旧图会让人误以为修改无效）。

## 页面约定（render.mjs ↔ film.html）

- 加载前注入 `window.TIMELINE = { fps, width, height, total, style, brand?, scenes:[{id, start, dur, vo?, impact?, fadeIn?, fadeOut?, …}], data }`；
  scene 可不写 start（自动累加），`data` 原样透传（录屏帧数、真实曲线等）。
- `<head>` 里先用 script 标签引入 `kit.js`，再用一段内联脚本调用 `K.useStyle('nebula')`：加载 `styles/<style>/theme.css` 和 `style.js`，
  `TIMELINE.style` 优先于括号里的默认值，并按 TIMELINE 尺寸设 `--W` / `--H`。`TIMELINE.brand`（如 `"brand.css"`）在风格之后加载，
  品牌自己的色值、字体覆盖风格（[styles.md](styles.md)「品牌层」）。
- `data-noread`：这段字是装饰，不查阅读、字号、对比；`data-hold`：这里是有意的停留，不查静止（[review.md](review.md)）。
- 页面必须定义 `window.render(t)`（可 async）；`K.film(RENDER, { after })` 已实现：按时间显示当前场景、画风格背景、调用 `RENDER[id](l, scene, t)`。
- 入场和招牌动作只用 `K.text` / `K.item` / `K.mask` / `K.lockup` / `K.hit`，颜色只用主题变量（接口见 [styles.md](styles.md)）。
- 图片序列用 `await K.setSrc(img, src)`，确保解码完成再截图。

## 硬规则

1. **确定性**：所有状态由 `t` 计算；禁止 CSS animation/transition、`Date.now()`、无种子随机（用 `K.rng(seed)` / `K.hash`）。每帧都要把用到的属性重新赋值，不能依赖上一帧。
2. **切场景用 display 不用 visibility**：子元素 `visibility:visible` 会穿透隐藏的父元素。`K.film` 已处理。
3. **共享 SVG defs 放在所有场景之外**：渐变/滤镜定义在 `display:none` 的场景里时，其他场景引用会失效。
4. **数字只用真实产物里的原值**（报告、导出的 JSON、录屏里的结果），不四舍五入成新数，不自己推算差值；示意图要标"示意"。风格里的装饰（尺寸标注、进度条、字形）不能变成编造的数据。
5. **免责声明照带**：示范数据、模拟结果、非建议等说明，在演示段落常驻（`.foot`），片尾完整一句；字号 ≥ 28 px（1080p）、用 `--sub`，要能读。
6. **"实时录屏 · N 倍快进"角标要属实**：只给真实录屏加，倍速按实际算。
7. **不用无授权素材**：音乐用 music.mjs 合成或用户提供的授权曲；字体用系统字体或放进 `fonts/` 的可嵌入字体，渲染时不联网取；参考作品只学语法（craft.md「版权红线」）。
8. **画面里不出现密钥、token、个人信息**：录屏/截图前确认，必要时裁掉。
9. **编码**：yuv420p + tv range（render.mjs 已处理；MJPEG 管道默认是 yuvj/pc，有的播放器会偏色）。
10. **私有内容不出项目**：客户/公司名、产品名、案例数据、录屏、截图、参考视频及其分析结果只放在该项目的片子目录里；
    不写回本 skill（模板、文档、风格、示例保持通用占位），用户自己的风格也只放通用的视觉规则；不上传到外部服务
    （edge-tts 只发送旁白文本，旁白里有保密内容时先征得同意或换本地 TTS）。

## 常见坑

| 现象 | 原因 / 处理 |
|---|---|
| 居中场景跑到顶部 | 场景被设成 `display:block` 覆盖了 flex；显示时置 `''` 恢复样式表的值 |
| 渐变字断色、每个字各一段渐变 | 逐字拆分后要 `K.measure()` 设 `--gw/--gx`；必须在字体加载后、场景可布局时量（`K.film` 首帧做） |
| logo 方块不见了 | 见硬规则 3 |
| 换了风格颜色没变 | 模板里写死了颜色；改成 `var(--accent)` 等变量，SVG 用 `style="fill:var(--c2)"` |
| 换了风格推近失效 / 场景跳动 | 风格的 `scene` 钩子动了 transform；钩子只用 opacity / clip-path / filter |
| check 说某段字没读完 | 入场太慢或离场太早；先延长场景或提前入场，不要删掉检查；讲解类片子用 `--pace calm` |
| check 报一堆 `text_below_floor` | 多半是重绘界面的小字：推近到字 ≥ 28 px，或只留要读的那行；窗口标题栏、行号、刻度标 `data-noread` |
| check 报 `empty_stretch` 在切点 | 上一场全部淡出后下一场才开始；让下一个入场提前、和离场重叠 30–50%，或缩短招牌时刻前的等待 |
| 封面（第 0 帧）是黑的 | 开场字或主视觉在 0 s 就要在画面上（入场时间写成负数，如 `K.text(el, l, -.9)`）；幕布只在片尾淡出 |
| 竖屏版式挤在中间 | 模板按 1920×1080 写；竖屏要重排版式（字号、栏位），正文放在 168–1330 px 高度带里，不是只改 `--size` |
| 只有 VP8 / 无音频 | 用了 Playwright 自带 ffmpeg；setup.mjs 装的 imageio-ffmpeg 才有 libx264+aac |
| PowerShell 读写 JSON 乱码 / 报错 | PS 5 把无 BOM 的 UTF-8 当 ANSI，`Set-Content -Encoding utf8` 又会加 BOM；用 node 或编辑器读写 JSON（脚本能容忍 BOM） |
| TTS 把数字读错 | 旁白里写汉字读法（"百分之二十八点三"），屏幕上再写阿拉伯数字 |
| 修改后预览图没变 | 看图缓存；读脚本打印出的新图路径 |

## 文件

- `templates/kit.js` + `kit.css`：动画工具箱和风格层（`useStyle` / `defineStyle`、`K.text/item/mask/lockup/hit`、计数、打字、描线、星空、粒子、连线火花、环绕点、录屏序列、字幕、场景调度）和主题变量的默认值。
- `templates/motion.html` + `motion.timeline.json` + `motion.cues.json`：动效片起步模板。
- `templates/narrated.html` + `narrated.script.json`：旁白实录片起步模板。
- `templates/patterns.html` + `patterns.timeline.json`：更多章节版式（对比柱条 + 数据曲线、双栏代码面板、标签收拢进粒子），示例数据全是虚构的。
- `styles/<slug>/`：八个风格（`STYLE.md`、`theme.css`、`style.js`、`style.json`）；`styles/_template/` 是新风格的空白起点。
- `templates/brand.css`：品牌层的空白起点（`init.mjs --brand` 拷进片子目录）。
- `deps/`：锁定的工具版本（playwright-core 的 package.json 和 lock，Python 的 requirements）；`VERSION`：skill 的版本。
- [styles.md](styles.md)：风格一览、怎么选、风格接口、品牌层、改风格和做自己的风格。
- [craft.md](craft.md)：SPEC、默认值黑名单、三条故事线、结构、Treatment、文案、节奏与动效的数、发布片、竖屏、声音、诚信与版权清单。
- [review.md](review.md)：`check.mjs` 的警告和改法、`review.mjs` 的审片图怎么看、P0/P1/P2 修改清单、交付说明。
