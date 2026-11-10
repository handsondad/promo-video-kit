# 旁白实录片

真实产品画面 + 中文旁白 + 烧录字幕。起步模板：`templates/narrated.html` + `narrated.script.json`，同样可以换风格：

```bash
node <skill>/scripts/init.mjs --dir .promo/film --cut narrated --style editorial
```

风格选择看内容：讲方法、培训用 whiteboard / editorial / blueprint，客户演示、发布用 keynote / nebula / swiss；
录屏是浅色界面时，深色风格要靠 `.shot` 窗口的边和阴影把它托住，读一张预览确认不刺眼。

## 1. 素材

**录屏**（证明"真能用"的主力）：
- 已有录屏（webm/mp4）直接用；没有就用 demo-screen-recording skill 录（同一个仓库、同一次 `install` 装好）：写一份流程 JSON，
  `config.viewport` 设成片子的尺寸（`{ "width": 1920, "height": 1080 }`，它默认是 1600×900），它会驱动真实操作、等 agent 跑完，
  并留下逐步截图用来核对。没有这个 skill 时，自己用 Playwright 的 `recordVideo` 录，尺寸同样设成片子的尺寸。
- 抽帧成图片序列（快进段 2–3 fps 足够，体积小、可随意变速）：
  ```bash
  ffmpeg -ss 24 -to 62 -i rec.webm -vf "fps=3" -q:v 3 frames/step1/%04d.jpg
  ffmpeg -ss 196 -to 426 -i rec.webm -vf "fps=2,crop=1600:780:0:120" -q:v 3 frames/step2/%04d.jpg   # 只要画面某块时裁切
  ```
- 片中帧号 = `floor(l × speed × fps)`，`speed` = 源时长 ÷ 场景内播放时长；角标写"实时录屏 · {speed} 倍快进"（取整）。

**截图**（结果页、报告、细节推近用，比录屏帧清晰）：用 Playwright 登录后切到对应状态 `page.screenshot()`，
1920×1080、deviceScaleFactor 1；需要更清晰的推近时用 `deviceScaleFactor: 2` 截图。截图前隐藏/避开 token、账号、个人信息。

**真实数字**：从产品导出的报告/JSON 里取，写进 `script.json` 的 `data` 或直接写进页面，注释出处。

## 2. 旁白脚本 → 时间轴

`script.json`（模板 `templates/narrated.script.json`）：

```json
{ "voice": "zh-CN-YunyangNeural", "rate": "+4%", "lead": 0.45, "tail": 0.7, "firstLead": 0.7,
  "data": { "footage": { "step1": { "dir": "frames/step1", "count": 114, "fps": 3, "speed": 6 } } },
  "scenes": [ { "id": "hook", "min": 6.5, "vo": "……" } ] }
```

- 场景时长 = max(min, lead + 旁白时长 + tail)；需要画面停留更久就加大 `min`。`vo` 为空串则是无旁白场景。
- 声音：`zh-CN-YunyangNeural`（沉稳男声，适合 B2B）、`zh-CN-XiaoxiaoNeural`（温和女声）、`zh-CN-YunjianNeural`（有劲男声）；
  英文 `en-US-AndrewNeural` / `en-US-AvaNeural`。全部列表：`<tools>/venv/.../python -m edge_tts --list-voices`。先合成 1–2 句给用户试听再定。
- **读的和显示的分开写**：`vo` 是念出来的（"百分之四十二点五"、"八十八元"、英文产品名按想要的读法拼写），`sub` 是字幕上显示的
  （"42.5%"、"¥88"）。两者按句末标点（。！？）切出的句数要一致；`vo` 里有汉字读数却没写 `sub` 时 tts.mjs 会警告——
  不然字幕会把"百分之四十二点五"原样打出来。
  ```json
  { "id": "result", "vo": "转化率从百分之十二提升到百分之十八点五。", "sub": "转化率从 12% 提升到 18.5%。" }
  ```
- **字幕按真实发音计时**：tts.mjs 让 edge-tts 同时输出句子边界，timeline 里每段旁白带 `cues`（每句的起止秒数和显示文字），
  `K.subCues(TIMELINE.scenes)` 直接拿来用，字幕跟着声音换句，不再按字数估算。
- **语速**：tts.mjs 按每秒字数（汉字 1、英文单词 2）检查，> 5.5 太赶、长句 < 3.5 太拖，各打一条警告；改文案或 `rate`。
- 改了一句只会重合成那一句（按 voice+rate+文本缓存）。

## 3. 画面

从 `templates/narrated.html` 起步，场景 id 与 `script.json` 一致。常用组件：
- `.kicker` + `.h1/.h2` + `K.mask`：标题遮罩上升（升起方式由风格决定）。
- 数字卡 `K.count`：从 0 数到目标值，附来源脚注。
- `.shot > .view > img`：应用窗口装录屏帧/截图（窗口的边、圆角、阴影由风格的 `.shot` 决定）；推近改 `img.style.transform = translate(..) scale(..)`，
  `transform-origin: 0 0`，坐标单位是窗口内像素（图片宽 = 窗口宽）。先 `--preview` 推近终点那一刻，调到目标区域正好填满再看中间帧。
- 录屏开头的打字很慢时，可以用"重建输入框"把用户真实发送的那句话打出来，再切到真实回复录屏。
- 结果页：左侧 KPI 卡（真实数字）+ 右侧报告截图推近到对应图表。
- 字幕：`K.subtitles(el, K.subCues(TIMELINE.scenes), t)`，每句一条，过长的按画面宽度折行（最多 24 字一行）；
  字幕条在 `.foot` 免责小字上方，两者共用底部一条带，不要把别的字放进去；字幕条的样子由风格的 `.sub` 决定。
- 场景转场：script 的场景写 `fadeIn` / `fadeOut`（模板默认 0.45 / 0.35 s），由风格的 `scene` 钩子执行。
- 演示段落常驻免责小字（`#foot`），片尾完整免责。

## 4. 音频

- 只有旁白：`mix.mjs --voice vo.wav --music <无声或极轻的 bed>`，或直接 `render.mjs --audio vo.wav`（不做响度归一）。
- 垫乐 + 音效：`music.mjs --out bed.wav --sfx sfx.wav` 生成低强度 bed（`palette` 用风格对应的那个，见 motion.md「配乐」；
  `groove`/`arp` 开在旁白段，`impacts` 只给片尾落版），音效单独一轨；
  `mix.mjs --voice vo.wav --music bed.wav --sfx sfx.wav --timeline timeline.json --out mix.wav`：
  垫乐按旁白时间提前压下（默认 `--duck -14`，人声比垫乐高约 15 dB），句间停顿 < 0.6 s 不回弹，长停顿里音乐回来托住画面；
  人声过一道压缩，音效不闪避；最后两遍线性归一到 −15 LUFS、true peak −1.5 dBTP。
  不给 `--timeline` 时退回侧链（等人声出来才压，开头一个字会被音乐盖住）。

## 5. 成片节奏参考（约 110 s）

| 场景 | 时长 | 内容 |
|---|---|---|
| hook | 8 | 事件 + 关键数字 pill + 一个问题 |
| problem | 9 | 三个有出处的行业数字（计数动画） |
| status | 8 | 现有三种手段，各一句缺点 |
| position | 9 | logo + 一句话定位 |
| step1–3 | 12 / 17 / 10 | 左侧编号与要点，右侧真实录屏快进 + 推近 |
| result | 12 | KPI 卡 + 报告截图推近 |
| trust | 12 | 六格"为什么可信" |
| scale | 7 | 还能做的场景标签 |
| end | 7.5 | logo + 口号 + 唯一入口 + 免责 |

模板里没有的 trust / scale 两种版式：trust 用 3×2 的 `.card` 网格（色点 + 标题 + 两行说明），scale 用 3×2 的圆角标签，
入场都用 `K.item(el, l, .9 + i * .3)` 依次出现。

交付前跑 `check.mjs --pace calm` 和 `review.mjs`（[review.md](review.md)）：讲解片的观众要边听边读，字幕和屏幕字都按慢一档的阅读速度查，
画面可以在旁白撑着时停得久一点（静止上限 4.5 s）。模板用 `onVoice(s, 比例)` 把每样东西排在旁白的相应位置出现：旁白说到哪样，哪样才出现。
