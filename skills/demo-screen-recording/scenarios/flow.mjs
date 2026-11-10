// Generic config-driven scenario. Describe the flow in a JSON file instead of writing code:
//   node record.mjs scenarios/flow.mjs out.webm   with  FLOW=path\to\flow.json
// Step types (executed in order):
//   { "goto": "url" }                         navigate
//   { "click": "<target>" }                   hover + click (see target syntax below)
//   { "fill": "<target>", "text": "..." }     type text visibly
//   { "press": "<target>", "key": "Enter" }   press a key in an element
//   { "waitText": "regex", "timeoutSec": 120 }
//   { "wait": 2000 }                          pause (ms)
//   { "settle": 12000 }                       wait until the page stops changing for N ms
//   { "scroll": "<target>", "steps": 6 }      slow wheel scroll inside an element
//   { "shot": "tag" }                         screenshot
//   { "agent": { approve, done, onText, nudge, stallSec } }  long agent loop, see SKILL.md
// Target syntax: "role=button[name=/regex/]", "text=/regex/" or "text=exact", "placeholder=/regex/", "label=…", or any CSS selector.
// Pattern fields (waitText, approve, done, buttonHint, onText.when, nudge.busy) take "/regex/flags" or a bare regex source.
// config.storageState is resolved against the flow file.
import fs from 'node:fs';
import path from 'node:path';

const flowPath = process.env.FLOW;
if (!flowPath) throw new Error('Set FLOW=<flow.json>');
const flow = JSON.parse(fs.readFileSync(flowPath, 'utf8').replace(/^\uFEFF/, ''));
export const config = { name: 'demo', ...flow.config };
if (config.storageState) config.storageState = path.resolve(path.dirname(path.resolve(flowPath)), config.storageState);

const rx = (s) => { const m = /^\/(.*)\/([a-z]*)$/s.exec(s); return m ? new RegExp(m[1], m[2]) : null; };
const txt = (s) => rx(s) ?? s;
const pattern = (s) => (s == null ? null : rx(s) ?? new RegExp(s));

const ACTIONS = ['goto', 'click', 'fill', 'press', 'waitText', 'wait', 'settle', 'scroll', 'shot', 'agent'];
const problems = [];
if (!config.url) problems.push('config.url is missing');
if (!Array.isArray(flow.steps)) problems.push('steps must be an array');
for (const [i, s] of (flow.steps ?? []).entries()) {
  const at = `step ${i + 1}`;
  const kinds = ACTIONS.filter((k) => s[k] != null);
  if (kinds.length !== 1) { problems.push(`${at}: expected exactly one of ${ACTIONS.join(', ')}, got ${kinds.join(', ') || 'none'}`); continue; }
  if (s.fill != null && typeof s.text !== 'string') problems.push(`${at}: fill needs "text"`);
  if (s.agent) {
    if (!s.agent.approve) problems.push(`${at}: agent needs "approve" (the exact approval button labels)`);
    if (!s.agent.done) problems.push(`${at}: agent needs "done" (the authoritative completion text)`);
    for (const [k, r] of (s.agent.onText ?? []).entries()) if (!r.when) problems.push(`${at}: onText[${k}] needs "when"`);
    if (s.agent.nudge && (!s.agent.nudge.box || !s.agent.nudge.text)) problems.push(`${at}: nudge needs "box" and "text"`);
  }
  for (const v of [s.waitText, s.agent?.approve, s.agent?.done, s.agent?.buttonHint, s.agent?.nudge?.busy, ...(s.agent?.onText ?? []).map((r) => r.when)]) {
    if (typeof v === 'string') try { pattern(v); } catch (e) { problems.push(`${at}: ${e.message}`); }
  }
}
if (problems.length) throw new Error(`${flowPath}:\n  ${problems.join('\n  ')}`);

export function target(page, t) {
  let m;
  if ((m = /^role=(\w+)(?:\[name=(.+)\])?$/.exec(t))) return page.getByRole(m[1], m[2] ? { name: txt(m[2]) } : {}).first();
  if ((m = /^text=(.+)$/.exec(t))) return page.getByText(txt(m[1])).first();
  if ((m = /^placeholder=(.+)$/.exec(t))) return page.getByPlaceholder(txt(m[1])).first();
  if ((m = /^label=(.+)$/.exec(t))) return page.getByLabel(txt(m[1])).first();
  return page.locator(t).first();
}

export default async function (h) {
  const { page, log } = h;
  for (const [i, s] of flow.steps.entries()) {
    if (Date.now() > h.deadline) { log(`timeoutMin reached before step ${i + 1}`); return false; }
    const opt = s.optional;
    try {
      const tgt = s.click || s.fill || s.press || s.scroll;
      if (tgt) await target(page, tgt).waitFor({ timeout: (s.timeoutSec ?? (opt ? 5 : 30)) * 1000 });
      if (s.goto) await page.goto(s.goto, { waitUntil: h.config.waitUntil });
      else if (s.click) await h.click(target(page, s.click), s.pause ?? 900);
      else if (s.fill) await h.type(target(page, s.fill), s.text, s.delay ?? 60);
      else if (s.press) await target(page, s.press).press(s.key || 'Enter');
      else if (s.waitText) { if (!await h.waitText(pattern(s.waitText), (s.timeoutSec ?? 120) * 1000) && !opt) { log('timeout waiting', s.waitText); return false; } }
      else if (s.wait) await h.wait(s.wait);
      else if (s.settle) await h.settle(s.settle);
      else if (s.scroll) await h.scroll(target(page, s.scroll), s.steps ?? 6);
      else if (s.shot) await h.shot(s.shot);
      else if (s.agent) {
        const a = s.agent; const fired = new Set();
        const st = await h.drive({
          hasText: pattern(a.buttonHint) ?? /./,
          approve: pattern(a.approve),
          done: pattern(a.done),
          stallMs: (a.stallSec ?? 300) * 1000,
          // onText: [{ "when": "/regex/", "click": "<target>", "shot": "tag", "once": true }]
          async onTick(body) {
            for (const [k, r] of (a.onText || []).entries()) {
              if ((r.once !== false && fired.has(k)) || !pattern(r.when).test(body)) continue;
              fired.add(k);
              if (r.click) await target(page, r.click).click().catch(() => {});
              if (r.shot) { await h.wait(800); await h.shot(r.shot); }
              log('onText', r.when);
            }
          },
          nudge: a.nudge && { box: () => target(page, a.nudge.box), text: a.nudge.text, max: a.nudge.max ?? 2, minApprovals: a.nudge.minApprovals ?? 0,
            idleMs: (a.nudge.idleSec ?? 20) * 1000, busy: pattern(a.nudge.busy) ?? undefined,
            skip: async () => a.nudge.until != null && fired.has(a.nudge.until) },
        });
        if (!st.done && !opt) { log('agent loop ended without done'); if (!a.continueOnFail) return false; }
      }
      if (s.after) await h.wait(s.after);
    } catch (e) {
      if (!opt) throw e;
      log(`step ${i + 1} skipped:`, e.message.split('\n')[0]);
    }
  }
  return true;
}
