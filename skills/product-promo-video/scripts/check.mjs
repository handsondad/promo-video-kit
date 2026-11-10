// Craft check: samples the film the way a first-time viewer sees it and lists what they would trip over, each with a fix.
//   node check.mjs --film film.html --timeline timeline.json [--audio mix.wav] [--pace promo|calm] [--floor 28]
//                  [--step 0.1] [--strict] [--json check.json]
// Warnings:
//   line_unread       text gone before it can be read. Needs 0.5 s + 0.3 s a word (Chinese is split into words, not
//                     characters); promo warns under 75% of that, calm under 100%. One or two words may flash for 0.4 s;
//                     the film's last line holds 2 s (calm 3 s).
//   sub_short         a subtitle under 1.2 s (calm 1.8 s); subtitles are also heard, so they follow the voice.
//   text_below_floor  reading text under 2.6% of the frame's short side (28 px at 1080) for 0.5 s or more.
//   first_frame_empty frame 0 is the thumbnail: it shows only the background, or is covered.
//   empty_stretch     nothing readable on screen for more than 0.75 s: a pause before a payoff is 0.3–0.75 s, not a void.
//   dead_stretch      nothing on screen changes for more than 3 s (calm 4.5 s, while a voice carries it); the last 3 s,
//                     an end card, are exempt.
//   idle_drift        landed elements that keep creeping (float loops, slow pushes) for 2.5 s or more.
//   outside_safe      text outside the 90% action-safe box for 0.5 s or more.
//   clipped_text      text cut by an overflow box or the frame edge for 0.5 s or more.
//   low_contrast      text against the pixels behind it under 4.5:1 (3:1 for large type), at the beat frames.
//   text_overlap      two readable texts overlap for 0.2 s or more (a same-place swap, a subtitle over a footnote).
//   media_missing     a picture that failed to load (a blank or stale frame).
//   media_soft        a picture shown above 1.15× its own pixels for 0.5 s or more (soft UI text after a push-in).
//   shot_treated      a real capture (.shot or data-real) recoloured by a filter or blend mode for 0.5 s or more.
//   not_deterministic a frame that differs when reached by seeking backwards (state kept between frames).
//   film_silent       a film over 15 s with no sound.
// data-noread on an element or an ancestor skips the text checks (decoration, texture, mock UI chrome); data-hold
// marks an intended hold and skips the stillness checks. A text block is [data-split], .m, .sub or [data-read], else the
// element that holds the text.
import { existsSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { arg, ffmpeg, launch, normalizeTimeline, openFilm, readJson, run } from './lib.mjs';

const film = resolve(arg('film', 'film.html'));
const tl = normalizeTimeline(readJson(resolve(arg('timeline', 'timeline.json'))));
const step = Number(arg('step', .1));
const calm = arg('pace', 'promo') === 'calm';
const W = tl.width, H = tl.height, short = Math.min(W, H);
const floorPx = Number(arg('floor', Math.round(.026 * short)));
const browser = await launch();
const errors = [];
const page = await openFilm(browser, film, tl, errors);

await page.evaluate(() => {
  const BLOCK = '[data-split], .m, .sub, [data-read]';
  const found = new Set();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!n.nodeValue.trim() || !el || el.closest('script, style, #__styleboard')) continue;
    found.add(el.closest(BLOCK) ?? el);
  }
  const blocks = [...found].filter((b) => ![...found].some((o) => o !== b && o.contains(b)));
  blocks.forEach((b, i) => { b.dataset.ck = String(i); });
  const clipped = (e) => { const c = e.style?.clipPath; return c && c !== 'none'; };
  // A clip-path counts as hidden for reading (a wipe is not yet readable), not for presence (a half-wiped logo is there).
  const opacity = (e, clipHides = true) => {
    let op = 1;
    for (let n = e; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (clipHides && clipped(n))) return 0;
      op *= Number(cs.opacity);
    }
    return op;
  };
  const box = (r) => [r.left, r.top, r.right, r.bottom].map((v) => Math.round(v * 10) / 10);
  // How much of the block has arrived: share of split characters shown, or of a masked line risen into view.
  const arrived = (el) => {
    if (el._chars?.length) {
      const all = el._chars.filter((c) => c.textContent.trim());
      return all.filter((c) => Number(getComputedStyle(c).opacity) > .6 && !clipped(c)).length / Math.max(1, all.length);
    }
    if (el.classList.contains('m') && el.firstElementChild) {
      const s = el.firstElementChild, a = el.getBoundingClientRect(), b = s.getBoundingClientRect();
      const rise = b.height > 0 ? Math.max(0, (Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) / b.height) : 0;
      return rise * wiped(s);
    }
    return wiped(el);
  };
  // The open share of an inset() clip-path wipe (percent sides only); 1 without one.
  const wiped = (e) => {
    const m = /inset\(([^)]*)\)/.exec(e.style.clipPath || '');
    if (!m) return 1;
    const v = m[1].trim().split(/\s+/).map((x) => (x.endsWith('%') ? Math.max(0, parseFloat(x)) / 100 : 0));
    const [t, r = t, b = t, l = r] = v;
    return Math.max(0, 1 - t - b) * Math.max(0, 1 - l - r);
  };
  // The nearest ancestor that clips its overflow, if the block sticks out of it.
  const cutBy = (el, r) => {
    for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (!/hidden|clip/.test(cs.overflowX + cs.overflowY)) continue;
      const a = n.getBoundingClientRect();
      return r.left < a.left - 2 || r.right > a.right + 2 || r.top < a.top - 2 || r.bottom > a.bottom + 2;
    }
    return false;
  };
  // The box of the glyphs themselves, not of the (often full-width) element.
  const ink = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return r.width ? r : el.getBoundingClientRect();
  };
  // The element that holds most of the block's text: its size and colour are what the viewer reads.
  const holder = (el) => {
    let best = el, len = 0;
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = w.nextNode(); n; n = w.nextNode()) if (n.nodeValue.trim().length > len) { len = n.nodeValue.trim().length; best = n.parentElement; }
    return best;
  };
  const small = document.createElement('canvas');
  small.width = 48; small.height = 27;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  window.__ck = () => {
    const texts = [];
    const sig = [];
    for (const el of blocks) {
      const op = opacity(el), seen = opacity(el, false);
      if (seen < .05) continue;
      const r = ink(el);
      if (r.width < 1 || r.height < 1) continue;
      const hd = holder(el), cs = getComputedStyle(hd);
      const text = el.textContent.replace(/\s+/g, ' ').trim();
      const got = arrived(el);
      sig.push(`${el.dataset.ck}:${box(r).map(Math.round).join(',')}:${Math.round(seen * 20)}:${Math.round(got * 20)}:${el.style.clipPath}:${text}`);
      if (seen < .5) continue;
      const scale = hd.offsetHeight ? hd.getBoundingClientRect().height / hd.offsetHeight : 1;
      const grad = [el, ...el.querySelectorAll('*')].some((c) => { const s = getComputedStyle(c); return /text/.test(s.backgroundClip + s.webkitBackgroundClip) || s.webkitTextFillColor === 'rgba(0, 0, 0, 0)'; });
      texts.push({
        k: el.dataset.ck, text, box: box(r), op, ok: op >= .5 && got >= .9, present: got >= .3, font: parseFloat(cs.fontSize) * scale, weight: Number(cs.fontWeight) || 400,
        color: cs.color, grad: grad || el instanceof SVGElement, sub: el.classList.contains('sub') || el.id === 'sub', noread: !!el.closest('[data-noread]'),
        hold: !!el.closest('[data-hold]'), cut: cutBy(el, r),
      });
    }
    for (const el of document.querySelectorAll('section img, section svg, section .card, section video')) {
      if (opacity(el) < .05) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 1) continue;
      const s = getComputedStyle(el);
      sig.push(`${box(r).map(Math.round).join(',')}:${Math.round(opacity(el) * 20)}:${el.currentSrc ?? ''}:${s.borderColor}:${s.backgroundColor}`);
    }
    let inkPx = 0;
    for (const c of document.querySelectorAll('canvas:not(#bg)')) {
      if (!c.width || opacity(c) < .05) continue;
      sctx.clearRect(0, 0, 48, 27); sctx.drawImage(c, 0, 0, 48, 27);
      const d = sctx.getImageData(0, 0, 48, 27).data;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 40) inkPx += 1;
      sig.push(String(d.reduce((a, v, i) => (a + v * (i % 97 + 1)) % 1e9, 0)));
    }
    const hold = !!document.querySelector('section:not([style*="display: none"])[data-hold], section:not([style*="display: none"]) [data-hold]');
    const curtain = document.getElementById('curtain');
    const media = [...document.querySelectorAll('section img, section svg, section video, section .card, section .lock')].some((e) => opacity(e, false) > .5 && e.getBoundingClientRect().width > 40);
    // Pictures on screen: how far they are enlarged past their own pixels, and (for real captures, .shot or data-real)
    // whether anything recolours them.
    const imgs = [];
    for (const img of document.querySelectorAll('section img')) {
      if (!img.getAttribute('src') || opacity(img, false) < .5) continue;
      const r = img.getBoundingClientRect();
      if (r.width < 40) continue;
      let treated = '';
      if (img.closest('.shot, [data-real]')) {
        for (let n = img; n && n.tagName !== 'SECTION'; n = n.parentElement) {
          const s = getComputedStyle(n);
          if (s.filter !== 'none' || s.mixBlendMode !== 'normal') { treated = s.filter !== 'none' ? s.filter : `mix-blend-mode: ${s.mixBlendMode}`; break; }
        }
      }
      imgs.push({ src: img.getAttribute('src'), broken: img.complete && !img.naturalWidth, zoom: img.naturalWidth ? r.width / img.naturalWidth : 0, treated });
    }
    return { texts, sig: sig.join('|'), hold, covered: curtain ? Number(getComputedStyle(curtain).opacity) > .85 : false, media, inkPx, imgs, mediaErrors: [...(window.__mediaErrors ?? [])] };
  };
});

const words = (s) => [...new Intl.Segmenter('zh', { granularity: 'word' }).segment(s)].filter((w) => w.isWordLike).length;
const warn = [];
const add = (code, t, text, fix) => warn.push({ code, t: Math.round(t * 10) / 10, text, fix });
const scenes = tl.scenes;
const sceneAt = (t) => scenes.find((s) => t >= s.start && t < s.start + s.dur) ?? scenes.at(-1);

// Sample the whole film.
const frames = [];
const n = Math.ceil(tl.total / step);
for (let i = 0; i <= n; i += 1) {
  const t = Math.min(tl.total - 1e-3, i * step);
  await page.evaluate((x) => window.render(x), t);
  frames.push({ t, ...(await page.evaluate(() => window.__ck())) });
}

// Spans: how long each text block is readable, and how long each layout fault lasts. A gap of 0.2 s or less (a flicker,
// an accent beat) does not end a span.
const spans = (pick) => {
  const open = new Map(), done = [];
  for (const f of frames) {
    const now = new Map(f.texts.filter(pick).map((x) => [x.sub ? `sub:${x.text}` : x.k, x]));
    for (const [k, x] of now) if (open.has(k)) open.get(k).seen = f.t; else open.set(k, { ...x, t0: f.t, seen: f.t });
    for (const [k, x] of open) if (!now.has(k) && f.t - x.seen > .2 + 1e-6) { done.push({ ...x, t1: x.seen + step }); open.delete(k); }
  }
  for (const x of open.values()) done.push({ ...x, t1: Math.min(tl.total, x.seen + step) });
  return done.map((x) => ({ ...x, dur: x.t1 - x.t0 }));
};
const reading = spans((x) => x.ok && !x.noread);
const last = Math.max(0, ...reading.filter((x) => !x.sub).map((x) => x.t0));
for (const x of reading) {
  if (x.sub) {
    const need = calm ? 1.8 : 1.2;
    if (x.dur + step / 2 < need) add('sub_short', x.t0, x.text, `subtitle held ${x.dur.toFixed(1)} s, needs ${need} s → merge with the next line or let the voice run longer`);
    continue;
  }
  const w = words(x.text);
  if (!w) continue;
  const target = .5 + .3 * w;
  let need = w <= 2 ? .4 : target * (calm ? 1 : .75);
  if (x.t0 === last && x.t1 >= tl.total - step) need = Math.max(need, calm ? 3 : 2);
  if (x.dur + 1 / 30 + step / 2 < need) add('line_unread', x.t0, x.text, `${w} words held ${x.dur.toFixed(1)} s, needs ${need.toFixed(1)} s → land it earlier, hold it longer, or cut words`);
}
for (const x of spans((x) => !x.noread && x.font < floorPx - .5)) {
  if (x.dur >= .5) add('text_below_floor', x.t0, x.text, `${Math.round(x.font)} px for ${x.dur.toFixed(1)} s; the floor is ${floorPx} px → enlarge it, or mark it data-noread if no one needs to read it`);
}
const safe = [W * .05, H * .05, W * .95, H * .95];
for (const x of spans((x) => !x.noread && (x.box[0] < safe[0] - 4 || x.box[1] < safe[1] - 4 || x.box[2] > safe[2] + 4 || x.box[3] > safe[3] + 4))) {
  if (x.dur >= .5) add('outside_safe', x.t0, x.text, `outside the 90% action-safe box for ${x.dur.toFixed(1)} s → keep text ${Math.round(W * .05)} px from the sides, ${Math.round(H * .05)} px from top and bottom`);
}
for (const x of spans((x) => !x.noread && (x.cut || x.box[0] < -2 || x.box[1] < -2 || x.box[2] > W + 2 || x.box[3] > H + 2))) {
  if (x.dur >= .5) add('clipped_text', x.t0, x.text, `cut by its box or the frame for ${x.dur.toFixed(1)} s → widen the box, shorten the line, or let it wrap`);
}

// Two readable texts on top of each other: a swap in the same place that overlaps, or a subtitle over a footnote.
// Line boxes reach past the glyphs (more so with handwriting faces and tilted type), so stacked lines touch: trim a
// quarter of the font size off the top and bottom, then count it only when 30% of the shorter one is covered.
const core = (x) => [x.box[1] + .25 * x.font, x.box[3] - .25 * x.font];
const meet = (a, b) => {
  if (Math.min(a.box[2], b.box[2]) - Math.max(a.box[0], b.box[0]) <= 4) return false;
  const [at, ab] = core(a), [bt, bb] = core(b);
  return Math.min(ab, bb) - Math.max(at, bt) > Math.max(4, .3 * Math.min(ab - at, bb - bt));
};
const overlaps = new Map();
for (const f of frames) {
  const live = f.texts.filter((x) => x.present && !x.noread && x.op > .5);
  const now = new Set();
  for (let i = 0; i < live.length; i += 1) for (let j = i + 1; j < live.length; j += 1) {
    if (!meet(live[i], live[j])) continue;
    const key = `${live[i].k}|${live[j].k}`;
    now.add(key);
    const o = overlaps.get(key);
    if (o && !o.done) o.t1 = f.t; else if (!o) overlaps.set(key, { t0: f.t, t1: f.t, a: live[i].text, b: live[j].text });
  }
  for (const [key, o] of overlaps) if (!now.has(key)) o.done = true;
}
for (const o of overlaps.values()) {
  if (o.t1 - o.t0 + step >= .2 - 1e-6) add('text_overlap', o.t0, `${o.a} × ${o.b}`, `two texts overlap for ${(o.t1 - o.t0 + step).toFixed(1)} s → move one, or let the first leave before the second lands in the same place`);
}

// Pictures: failed loads, captures enlarged past their pixels, real captures recoloured by the style.
const missing = new Set(frames.flatMap((f) => [...f.mediaErrors, ...f.imgs.filter((m) => m.broken).map((m) => m.src)]));
for (const src of missing) add('media_missing', frames.find((f) => f.mediaErrors.includes(src) || f.imgs.some((m) => m.broken && m.src === src))?.t ?? 0, src, 'this picture did not load, so the frame shows a blank or the previous image → check the path and the frame count in timeline data');
const mediaSpan = (pick, code, fix) => {
  const open = new Map();
  const close = (src, o) => { if (o.t1 - o.t0 + step >= .5 - 1e-6) add(code, o.t0, src, fix(o)); open.delete(src); };
  for (const f of frames) {
    const now = new Map(f.imgs.filter(pick).map((m) => [m.src.replace(/\d+(?=\.\w+$)/, '#'), m]));
    for (const [src, m] of now) { const o = open.get(src); if (o) { o.t1 = f.t; o.peak = Math.max(o.peak, m.zoom); } else open.set(src, { t0: f.t, t1: f.t, peak: m.zoom, treated: m.treated }); }
    for (const [src, o] of open) if (!now.has(src)) close(src, o);
  }
  for (const [src, o] of open) close(src, o);
};
mediaSpan((m) => m.zoom > 1.15, 'media_soft', (o) => `shown at ${o.peak.toFixed(2)}× its own pixels, so UI text goes soft → capture at a higher resolution (deviceScaleFactor 2), or push in less`);
mediaSpan((m) => m.treated, 'shot_treated', (o) => `a real capture is recoloured (${o.treated}) → frame it with crop, scale, border or overlays; status colours and charts are evidence`);

// First frame, stillness, drift.
const content = (f) => !f.covered && (f.texts.some((x) => !x.noread && x.present && !x.cut) || f.media || f.inkPx >= 3);
const f0 = frames[0];
if (f0.covered || (!f0.texts.some((x) => !x.noread && x.ok && !x.cut) && !f0.media)) add('first_frame_empty', 0, '', 'frame 0 is the thumbnail and shows nothing → have the opening line or key image already on screen at 0 s');
let empty = 0;
for (const [i, f] of frames.entries()) {
  if (!content(f) && f.t < tl.total - 1) { empty += step; continue; }
  if (empty > .75 + 1e-6) add('empty_stretch', f.t - empty, sceneAt(f.t - empty).id, `the screen is empty for ${empty.toFixed(1)} s → start the next entrance while the last exit is still going (30–50% overlap), or keep one object on screen across the cut`);
  empty = 0;
  if (i === frames.length - 1) break;
}
const deadMax = calm ? 4.5 : 3;
let still = 0;
for (let i = 1; i < frames.length; i += 1) {
  const f = frames[i];
  const same = f.sig === frames[i - 1].sig;
  if (same && !f.hold && f.t < tl.total - 3) still += step; else still = 0;
  const next = frames[i + 1];
  const ends = !next || next.sig !== f.sig || next.hold || next.t >= tl.total - 3;
  if (still > deadMax + 1e-6 && ends) add('dead_stretch', f.t - still, sceneAt(f.t).id, `nothing changes for ${still.toFixed(1)} s → add a beat (a reveal, a number, a UI reaction) or mark the hold data-hold if it is meant`);
  if (ends) still = 0;
}
const drift = new Map();
for (let i = 1; i < frames.length; i += 1) {
  const prev = new Map(frames[i - 1].texts.map((x) => [x.k, x]));
  for (const x of frames[i].texts) {
    const p = prev.get(x.k);
    const run = drift.get(x.k);
    const moved = p && p.text === x.text && !x.hold && x.ok && Math.max(...x.box.map((v, j) => Math.abs(v - p.box[j]))) > .04;
    const big = p && Math.max(...x.box.map((v, j) => Math.abs(v - p.box[j]))) > short * .01;
    if (moved && !big) {
      if (!run) drift.set(x.k, { t0: frames[i - 1].t, t1: frames[i].t, text: x.text, from: p.box, box: x.box });
      else Object.assign(run, { t1: frames[i].t, box: x.box });
    } else if (run) { run.done = true; }
  }
  for (const [k, r] of drift) if (r.done || !frames[i].texts.some((x) => x.k === k)) {
    const travel = Math.max(...r.box.map((v, j) => Math.abs(v - r.from[j])));
    if (r.t1 - r.t0 >= 2.5 && travel < short * .05) add('idle_drift', r.t0, r.text, `keeps creeping ${travel.toFixed(0)} px over ${(r.t1 - r.t0).toFixed(1)} s after landing → let it land and stay still; move the camera only with a purpose`);
    drift.delete(k);
  }
}
for (const r of drift.values()) {
  const travel = Math.max(...r.box.map((v, j) => Math.abs(v - r.from[j])));
  if (r.t1 - r.t0 >= 2.5 && travel < short * .05) add('idle_drift', r.t0, r.text, `keeps creeping ${travel.toFixed(0)} px over ${(r.t1 - r.t0).toFixed(1)} s after landing → let it land and stay still`);
}

// Seek order: a frame must depend on t alone. Re-render a dozen sampled times backwards and compare with the forward pass.
const probe = [...new Set(Array.from({ length: 12 }, (_, i) => Math.round(((i + .5) / 12) * (frames.length - 1))))].reverse();
for (const i of probe) {
  await page.evaluate((x) => window.render(x), frames[i].t);
  const again = await page.evaluate(() => window.__ck());
  if (again.sig !== frames[i].sig) { add('not_deterministic', frames[i].t, sceneAt(frames[i].t).id, 'this frame looks different when reached by seeking back → compute every property from t on every frame; do not keep state from the previous frame'); break; }
}

// Contrast at the beat frames: the text colour against a plate rendered with all text hidden.
const beats = [...new Set(scenes.flatMap((s) => [s.start + s.dur * .5, s.start + s.dur * .85, ...(s.impact != null ? [s.start + s.impact + .8] : [])])
  .map((t) => Math.round(Math.min(tl.total - .05, t) * 10) / 10))].sort((a, b) => a - b);
const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
const worst = new Map();
for (const t of beats) {
  await page.evaluate((x) => window.render(x), t);
  const texts = (await page.evaluate(() => window.__ck())).texts.filter((x) => !x.noread && !x.grad && x.ok && x.op > .95);
  if (!texts.length) continue;
  await page.evaluate(() => {
    for (const el of document.querySelectorAll('*')) { const s = getComputedStyle(el); if (/text/.test(s.backgroundClip + s.webkitBackgroundClip)) el.dataset.ckGrad = ''; }
    const st = document.createElement('style');
    st.id = '__ckplate';
    st.textContent = '*{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important}[data-ck-grad]{background:none!important}svg text{fill:transparent!important;stroke:transparent!important}';
    document.head.append(st);
  });
  const png = await page.screenshot({ type: 'png' });
  await page.evaluate(() => document.getElementById('__ckplate')?.remove());
  const raw = run(ffmpeg(), ['-hide_banner', '-loglevel', 'error', '-f', 'png_pipe', '-i', 'pipe:0', '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'], { input: png, encoding: 'buffer' }).stdout;
  for (const x of texts) {
    const [l, tp, r, b] = [Math.max(0, x.box[0]), Math.max(0, x.box[1]), Math.min(W - 1, x.box[2]), Math.min(H - 1, x.box[3])].map(Math.floor);
    if (r <= l || b <= tp) continue;
    const px = [];
    const sx = Math.max(1, Math.floor((r - l) / 24)), sy = Math.max(1, Math.floor((b - tp) / 8));
    for (let y = tp; y <= b; y += sy) for (let xx = l; xx <= r; xx += sx) { const o = (y * W + xx) * 3; px.push([raw[o], raw[o + 1], raw[o + 2]]); }
    px.sort((a, c) => lum(a) - lum(c));
    const bg = px[Math.floor(px.length / 2)];
    const c = (/rgba?\(([^)]+)\)/.exec(x.color)?.[1] ?? '255,255,255').split(',').map(Number);
    const a = (c[3] ?? 1) * x.op;
    const fg = [0, 1, 2].map((i) => a * c[i] + (1 - a) * bg[i]);
    const [hi, lo] = [lum(fg), lum(bg)].sort((p, q) => q - p);
    const ratio = (hi + .05) / (lo + .05);
    const need = x.font >= 36 || (x.font >= 28 && x.weight >= 700) ? 3 : 4.5;
    if (ratio < need && (!worst.has(x.k) || worst.get(x.k).ratio > ratio)) worst.set(x.k, { t, text: x.text, ratio, need });
  }
}
for (const w of worst.values()) add('low_contrast', w.t, w.text, `${w.ratio.toFixed(1)}:1 against what is behind it, needs ${w.need}:1 → use --ink or --sub instead of --dim, or put a plate behind it`);
await browser.close();

// Sound: the film's own mix, else a mix or score next to it.
const audio = typeof arg('audio') === 'string' ? resolve(arg('audio')) : ['mix.wav', 'score.wav', 'vo.wav', 'out/mix.wav', 'out/score.wav'].map((f) => join(dirname(film), f)).find(existsSync);
if (tl.total > 15) {
  let silent = !audio;
  if (audio) {
    const m = /mean_volume:\s*(-?[\d.]+) dB/.exec(run(ffmpeg(), ['-hide_banner', '-i', audio, '-af', 'volumedetect', '-f', 'null', '-']).stderr);
    silent = !m || Number(m[1]) < -50;
  }
  if (silent) add('film_silent', 0, audio ?? '', `a ${tl.total.toFixed(0)} s film with no sound → build cues.json and run music.mjs, or pass --audio`);
}

warn.sort((a, b) => a.t - b.t);
const codes = [...new Set(warn.map((w) => w.code))];
console.log(`check: ${tl.total.toFixed(1)} s, ${frames.length} samples, ${reading.length} text appearances, ${warn.length} warning(s)${errors.length ? `, ${errors.length} page error(s)` : ''}`);
for (const code of codes) {
  console.log(`\n${code}`);
  for (const w of warn.filter((x) => x.code === code)) console.log(`  ${w.t.toFixed(1).padStart(6)} s  ${w.text ? `${w.text.slice(0, 36)}  ` : ''}${w.fix}`);
}
const out = arg('json');
if (typeof out === 'string') writeFileSync(resolve(out), JSON.stringify({ total: tl.total, warnings: warn }, null, 2));
process.exit((warn.length && arg('strict') === true) || errors.length ? 1 : 0);
