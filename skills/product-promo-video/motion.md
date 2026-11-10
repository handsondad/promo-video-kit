# 动效片（纯音乐、可换风格）

纯音乐、无旁白；大字 + 矢量重绘的产品 UI；章节结构；一个招牌动作落在 logo 上。起步模板：`templates/motion.html`
（开场换词、logo 落定、打字、章节、片尾）和 `templates/patterns.html`（对比柱条 + 曲线、双栏代码面板、标签收拢）。
模板只调用风格钩子，所以同一份 film.html 在八个风格里都能直接渲染（`init.mjs --style`，或 `render.mjs --style` 临时换）。

```bash
node <skill>/scripts/init.mjs --dir .promo/film --cut motion --style swiss
```

## 1. 拆参考视频（有参考时）

```bash
node <skill>/scripts/analyze-reference.mjs ref.mp4 --out ref --every 5
```

然后**把 `ref/sheet-*.jpg` 和 5–10 张 `ref/k-*.jpg` 当图片读**，写下两样东西再动手：

**结构表**：时间段 → 段落作用 → 画面 → 屏幕文字。一部典型 60 s 动效参考片拆出来大致是：

| 时间 | 作用 | 画面 |
|---|---|---|
| 0–9 | 你已有的工具 / 缺什么 | "你已经有了 X" 换词 ×3，四周浮现工具卡片，落到一句"缺什么" |
| 9–15 | 定位 | 招牌动作 → logo + 一句口号 |
| 15–22 | 上手门槛 | 输入框打字一句话；右侧三行短句（"不用 X。不用 Y。一句话就够。"） |
| 22–27 | 能接入什么 | 中心球 + 节点逐个连线 |
| 27–57 | 三个卖点 | 每章：标题卡 "01 卖点名" → 请求卡 → 中心球 → 三张并行进度卡 → 结果卡 |
| 57–64 | 收束 + 行动 | 两行收束句 → logo + 唯一入口 |

**风格清单**：背景、字体、强调方式、卡片、入场、转场（`cuts` 很少说明是动效片）、角标、音频（`audioHint` + 自己确认有无旁白）。
把清单逐项对照 [styles.md](styles.md) 的风格一览，**找最接近的风格**；差得多的几项按"改一个风格"处理（主题变量、钩子），
不要在 film.html 里写死另一套颜色和入场。

只借结构和手法，不照搬对方的文案、logo、配色专有元素；分析结果和参考片本身都不写进交付物。

## 2. 把卖点映射成章节

- 每章 = 标题卡（`01` 大数字 + 标题 + 副标题，模板 `chapter()` 2.3 s）+ 内容（6–8 s）+ 底部一句结论。
- 内容画面用产品**真实的对象和数字**重绘：真实对象名、真实步骤名、真实计数、真实曲线（从产品导出的 JSON 读，
  通过 timeline 的 `data` 传进页面，如 `data.series = { x, a, b, flag, marker }`）。示意性的动画（进度百分比、粒子）可以，但不能编造结果。
- 可选的章节画面模式：
  - 请求卡 → 中心球 → 三张并行进度卡（`K.links` + `K.orbit` + 进度条），完成后左侧任务打勾（`motion.html` 的 ch1）；
  - 两种情形的对比柱条 + 曲线 SVG（`K.stroke` 描线，需要提醒的区间加阴影标注）（`patterns.html` 的 compare）；
  - 左右两栏代码面板：左边"做决定"、右边"算结果"，被拒绝的一行标红划线，需要注意的一行标黄（`patterns.html` 的 trace）。
- 每个风格 `STYLE.md` 第 6、8 节有它自己的镜头和招牌动作（例：swiss 的"网格有意义"、terminal 的"一行命令"、whiteboard 的"打勾清单"），
  章节画面优先用所选风格擅长的那种。

## 3. 动效词汇 → kit 调用

| 手法 | 实现 |
|---|---|
| 逐字入场 / 离场 | `K.text(el, l, at, { st, outAt, outD })`，元素加 `data-split`；样子由风格决定（模糊浮现、光点亮、槽口上升、打字、手写……） |
| 一个词强调 | `<span class="g warm">词</span>` / `g cool`；颜色来自主题的 `--warm` / `--cool` |
| "你已经有了 X" 换词 | 多个 `.w` 叠在同一位置，依次 `K.text` 并设 `outAt` |
| 输入框打字 | `K.type(el, text, l, at, d)` + `.caret` |
| 卡片、胶囊、行入场 | `K.item(el, l, at, { d, dy, blur, scale, outAt })` |
| 一行从遮罩升起 | `K.mask(el, l, at, d)`，`.m > span` |
| 数字计数 | `K.count(el, l, at, to, { d, decimals, prefix, suffix })` |
| 节点连线 + 流动光点 | `K.links(svg, defs)` / `K.drawLinks(svg, l)`；颜色写 `c: 'var(--c3)'` |
| 中心球环绕彩点 | `.hub` + `K.orbit(g)` |
| 背景（星空、扫描带……） | 风格的 `bg` 钩子，`K.film` 每帧自动画在 `canvas#bg` |
| logo 落定 | `K.lockup(lock, l, at)`（模板 `lockup()` 已包好） |
| 招牌动作 | 场景写 `impact`（相对秒），`after(t)` 里 `K.hit(t, s.start + s.impact, cx, cy)`；粒子、光扫、红线、圈注、彩纸由风格决定 |
| 场景转场 | 场景写 `fadeIn` / `fadeOut`（秒），由风格的 `scene` 钩子执行 |
| 章节标题卡 | 模板 `chapter(root, l)` |

## 4. 配乐

`music.mjs` 合成；`palette` 决定音色、速度和调式（`init.mjs` 按风格写好），cue 写成相对场景的时间，跟画面一起改时长也不会错位：

```json
{ "palette": "motorik", "grid": "logo+0.5",
  "ticks": [0.35, 1.85, 3.45, 5.05], "impacts": ["logo+0.5", "end+0.5"],
  "whooshes": ["ask", "ch1", "ch2", "ch3"], "groove": ["ask", "outro"], "hats": ["ch1", "outro"],
  "arp": ["graph", "outro+0.4"], "breath": ["outro", "end+0.4"] }
```

`start` / `end` 指整片的头尾；但有场景就叫 `end`（模板的片尾卡）时，`end` 指这个场景的开头。落在片长以外的音效听不到，
`music.mjs` 会打印 `warning: outside the … film`，看到就改。

出片前做母带：`music.mjs … --out bed.wav --sfx sfx.wav`，再 `mix.mjs --music bed.wav --sfx sfx.wav --out mix.wav`
（两遍线性归一到 −15 LUFS、true peak −1.5 dBTP，必要时先只削峰），`render.mjs --audio mix.wav`。
直接拿 `score.wav` 渲染也能出片，但响度没归一，平台会替你调，各平台结果不一样。

| palette | 风格 | 速度 | 性格 |
|---|---|---|---|
| synth | nebula | 100 | 锯齿 pad、侧链 sub bass、电子鼓、正弦琶音、上扬 + 冲击 |
| mallet | keynote | 104 | 正弦 pad、马林巴琶音、毛毡鼓、shaker、玻璃 tick、和弦式落定 |
| motorik | swiss | 120 | 稳定 8 分脉冲、紧底鼓 + 2/4 军鼓、拨弦、纸张 whoosh、盖章式落定 |
| felt | whiteboard、editorial | 84 | 温暖 pad、毛毡钢琴、刷子鼓、钢琴和弦 |
| chip | terminal | 132 | 方波琶音、芯片鼓、blip、下行扫频 |
| ambient | blueprint | 76 | 低沉 drone、玻璃琶音、无鼓、渐强落定 |
| pop | pop | 118 | 明亮 pad、拨弦、拍手、"啵"、boom + 和弦 |

- `grid` 对齐第一个重音，鼓点从这里按拍走；`impacts` = 招牌动作的峰值（前 1.6 s 自动有预备音）。
- `ticks` 给开场换词的每一拍一个轻音；`whooshes` 给每个章节切入；`breath` 是收尾前的静默（craft.md：至少两处）。
- 每个 cue 都要对得上画面里的一个动作；音效默认晚画面一帧（`lag`，`0` 关掉），重复的 tick / whoosh 自动轮换三个版本。
- 可在 cues 里写 `bpm`、`mood: minor|bright`、`voices: { arp: 'piano', … }` 覆盖调色板；`--palette` 只覆盖这一次。
- 合成音乐是占位：告诉用户可以换成授权曲（直接 `--audio 授权曲.wav`，或用 ffmpeg 截到片长并淡出）。

## 5. 时长参考（约 64 s）

| 场景 | 时长 | 重点 |
|---|---|---|
| hook | 9.2 | 三拍换词 + 三张工具卡 → 一句"缺什么"（停够阅读时间） |
| logo | 4.6 | impact 0.5（切点前后的空屏不超过 0.75 s），口号在落定后 0.6 s 入场 |
| ask | 7.0 | 打字一句用户会说的话；右侧三行短句 |
| graph | 5.2 | 中心球连出 5–7 个真实对象节点 |
| ch1 / ch2 / ch3 | 9.9 / 10 / 9.5 | 三个卖点，各一种画面模式 |
| outro | 4.6 | 浮动标签收拢到中心 |
| end | 6.5 | impact 0.5 → logo + 口号 + 唯一入口 + 免责 |

风格会改变节奏：editorial、whiteboard、blueprint 的入场慢 20–30%，场景相应加长；terminal、pop、keynote 可以更紧。
改完时长跑一次 `check.mjs` 和 `review.mjs`（[review.md](review.md)）。竖屏（`--size 1080x1920`）要重排版式：标题字号按宽度放大、卡片改成上下排列。
