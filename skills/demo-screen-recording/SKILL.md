---
name: demo-screen-recording
description: >-
  Records the real screen of a live web app (WebM or MP4) by driving it headlessly with Playwright, as page tours,
  form flows, or AI chat/agent flows with approval clicks, long waits, nudges and a completion check, plus step
  screenshots to verify it. Use for 录屏, 操作视频, 演示录屏, a screen recording, walkthrough or raw demo capture of
  a web flow, or to re-record one. For an edited promo with narration, music and titles, use product-promo-video.
---

# Demo Screen Recording

Records a browser session with Playwright `recordVideo`. A **flow** describes what to do. The runner handles the video, timing, screenshots and robustness.

The result is raw footage of the real product. When it is meant to go into a promo or explainer video, record at the
film's size (`"viewport": { "width": 1920, "height": 1080 }`) and hand it to product-promo-video's narrated cut.

## Files

- `scripts/record.mjs`: the runner. Usage: `node record.mjs <scenario.mjs> [out.webm | out.mp4]`. It writes the video, a `<name>-shots/` folder of numbered PNGs, and exits 0 only if the scenario succeeded. An `.mp4` output keeps the `.webm` beside it.
- `scenarios/flow.mjs`: a generic scenario driven by a JSON flow file passed in `FLOW=<flow.json>`. Most demos need only JSON.
- `examples/page-tour.json`: a static page walkthrough (click and scroll).
- `examples/chat-agent.json`: a template for any AI chat/agent product: send a prompt → approve cards → wait for done → open the report.
- For logic JSON can't express, write a custom scenario `.mjs` that exports `config` and `default async (h) => boolean`, using the helpers below.

## Flow JSON

```json
{ "config": { "name": "my-demo", "url": "http://localhost:3000/", "timeoutMin": 20, "viewport": { "width": 1600, "height": 900 } },
  "steps": [ { "click": "role=button[name=/开始/]", "after": 1500 }, { "shot": "start" } ] }
```

Steps run in order:

| step | meaning |
|---|---|
| `goto` | Navigate to a URL. |
| `click` | Hover, then click a target. |
| `fill` + `text` | Type the text visibly into a target. |
| `press` + `key` | Press a key in a target. |
| `waitText` | Wait until the page text matches a regex. |
| `wait` | Pause for N ms. |
| `settle` | Wait until the page is quiet for N ms. |
| `scroll` | Slowly wheel-scroll inside a target. |
| `shot` | Take a screenshot with a tag. |
| `agent` | Run the agent loop (below). |

Any step also accepts `"optional": true` (a failure is logged and skipped) and `"after": ms`. The flow is checked
before the browser starts: each step needs exactly one action, and an `agent` step needs `approve` and `done`.

- **Config:** `name`, `url`, `timeoutMin` (the whole recording; checked between steps and inside waits), `viewport`,
  `channel` (`msedge` by default, `chrome`), `headless`, `locale` (`zh-CN` by default), `storageState` (a saved
  login, resolved against the flow file), `waitUntil` for page loads (`load` by default; `networkidle` never settles
  on apps that keep a stream or poll open), and `contextOptions` for anything else Playwright's `newContext` takes.
- **Patterns** (`waitText`, `approve`, `done`, `buttonHint`, `onText[].when`, `nudge.busy`) take `"/regex/flags"` or a
  bare regex source.
- **Targets:** `role=button[name=/regex/]`, `text=/regex/`, `text=exact`, `placeholder=/regex/`, `label=…`, or any CSS selector.
- **Agent loop:**
  - `approve` is a regex for exact approval-button labels to click, and `buttonHint` pre-filters buttons.
  - `done` is a regex for authoritative completion text.
  - `onText` is a list of `{when, click, shot}` reactions, each fired once.
  - `nudge` is `{box, text, busy, idleSec, max, minApprovals, until}`. It types `text` into the chat when the agent has been idle `idleSec` and `busy` doesn't match, but stops once `onText[until]` has fired.
  - `stallSec` gives up when nothing changes.

## Helpers for custom scenarios (`h`)

| helper | purpose |
|---|---|
| `h.click(loc)` | Click with a visible hover and pause. |
| `h.type(loc, text)` | Type character by character. |
| `h.drive({hasText, approve, done, onTick, nudge, stallMs})` | The agent loop. |
| `h.waitText(re)` / `h.settle()` | Wait for text, or wait until the page is quiet. |
| `h.scroll(loc, steps)` | Slow wheel scroll. |
| `h.shot(tag)` | Screenshot. |
| `h.signature()` | Page text with digits stripped. |

## Workflow

`<skill>` below is the absolute path of this skill's folder (where this SKILL.md is); it differs per agent.

1. **Setup (once).** playwright-core is looked up in `PLAYWRIGHT_CORE`, this skill's `node_modules` (`npm install` here),
   then the shared promo tools (`~/.promo-tools`, installed by product-promo-video's `setup.mjs`). Recording also needs
   Playwright's own encoder once per machine: `node <playwright-core folder>/cli.js install ffmpeg`. Installed Edge is
   used (`channel: 'msedge'`); change `config.channel` for Chrome.
2. **App ready.** The target app must be running and reachable without manual login: a dev auto-login, a test account the user named, or a `storageState`. Don't kill servers you didn't start.
3. **Probe first.** Take one screenshot of the start page and read the real button, tab and placeholder labels from the UI or source. Never guess labels.
4. **Write the flow JSON**, starting from the closest example.
5. **Record**, using a long wait for agent flows (PowerShell; in bash use `FLOW=<flow.json> node …`):
   ```powershell
   $env:FLOW="<flow.json>"; node "<skill>\scripts\record.mjs" "<skill>\scenarios\flow.mjs" "<outDir>\<name>.webm"
   ```
   Recording refuses to overwrite an existing video, screenshots folder, or temporary recording folder. Choose a new output name or move the existing artifacts first.
6. **Verify through the screenshots, not the log.** Check that the key states really appeared (e.g. the result or report has content). If not, fix the flow and re-record.
7. **MP4.** Playwright's encoder writes WebM only. Name the output `<name>.mp4` and the runner converts it with a full
   ffmpeg: `FFMPEG`, the promo tools' ffmpeg, or one on `PATH`.
8. **Report** the video path, duration, size, and any product bugs noticed during recording.

## Lessons learned

- **"Example" or "starter" buttons often only fill the input box.** Send explicitly with `press Enter`.
- **Click approval buttons by exact label**, and never "reject" or "don't ask again" variants unless asked.
- **Live timers ("用时 75 秒") change every second.** Stall detection compares text with digits stripped.
- **Use the authoritative done signal** (task status, report content), not an optimistic chat message. Otherwise you record an empty report.
- **Agents sometimes end their turn early.** Configure `nudge` so the recording keeps moving.
- **Multiple `<textarea>`s can exist** (hidden autosize mirrors). Target inputs by placeholder or label.
- **If the model backend is down, the agent "thinks" forever.** Check the screenshots before blaming the flow, and always set `timeoutMin`.
- **Video size is about 13 MB per minute at 1600×900.** Avoid long idle waits.
