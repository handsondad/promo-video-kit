// Promo kit: deterministic animation helpers for films rendered frame by frame. Every helper is a pure function of the
// scene-local time `l` (seconds), so any frame can be rendered in any order. Never use CSS animations or transitions.
//
// Style layer. A film loads one style in <head>, after kit.js:  <script>K.useStyle('nebula')</script>
// (TIMELINE.style, set by render.mjs --style or the timeline file, wins over the argument). The style's style.js calls
// K.defineStyle({...}) with any of these hooks; templates call only the semantic helpers, so they render in every style:
//   K.text(el, l, at, o)      split text ([data-split]) in / out      o: { st, d, outAt, outD }
//   K.item(el, l, at, o)      a whole element in / out               o: { d, dy, outAt, outD, blur, scale }
//   K.mask(el, l, at, d)      a .m line rising out of its mask
//   K.lockup(el, l, at)       the logo lockup landing at the hit
//   K.hit(t, T, cx, cy, o)    the signature moment at absolute time T, drawn on canvas#fx
//   bg(ctx, t, W, H)          the moving background on canvas#bg, every frame (K.film calls it)
//   scene(el, p, phase)       scene transition, p 0 → 1 visible, phase 'in' | 'out' (K.film calls it when fades are set)
(() => {
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const out3 = (x) => 1 - Math.pow(1 - clamp(x), 3);
  const out5 = (x) => 1 - Math.pow(1 - clamp(x), 5);
  const inout = (x) => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
  const back = (x, s = 1.6) => { x = clamp(x) - 1; return 1 + (s + 1) * x * x * x + s * x * x; };
  // cubic-bezier(.7,0,.2,1)-like precise ease (no overshoot), for grid snaps
  const snap = (x) => { x = clamp(x); return x < .5 ? 8 * x ** 4 : 1 - 8 * (1 - x) ** 4; };
  const steps = (x, n) => Math.floor(clamp(x) * n) / n;
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const rng = (seed) => { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  const hash = (i, seed = 1) => { let x = (i * 374761393 + seed * 668265263) >>> 0; x = ((x ^ (x >>> 13)) * 1274126177) >>> 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
  const PAL = ['#22d3ee', '#60a5fa', '#a78bfa', '#f472b6', '#fb923c', '#34d399', '#fbbf24', '#e0e7ff'];
  const cssVar = (name, el = document.documentElement) => getComputedStyle(el).getPropertyValue(name).trim();
  const color = (i) => `var(--c${(i % 6) + 1})`;
  const palette = () => [1, 2, 3, 4, 5, 6].map((i) => cssVar(`--c${i}`)).filter(Boolean);

  // [data-split] → one span per character. Characters inside a `.g` span (with a --grad class) share one continuous gradient.
  function split(root = document) {
    for (const el of $$('[data-split]', root)) {
      if (el._chars) continue;
      const chars = [];
      const walk = (node, seg) => {
        for (const child of [...node.childNodes]) {
          if (child.nodeType === 3) {
            const frag = document.createDocumentFragment();
            for (const ch of child.textContent) {
              const span = document.createElement('span');
              span.className = seg ? `c g ${seg.className.replace(/\bg\b/, '').trim()}` : 'c';
              span.textContent = ch;
              span._seg = seg;
              frag.append(span); chars.push(span);
            }
            child.replaceWith(frag);
          } else if (child.nodeType === 1) walk(child, child.classList.contains('g') ? child : seg);
        }
      };
      walk(el, null);
      el._chars = chars;
    }
  }
  // Must run once with every scene laid out (display != none), after fonts load: K.film() does this on the first frame.
  function measure() {
    for (const el of $$('[data-split]')) {
      const segs = new Map();
      for (const c of el._chars) if (c._seg) { if (!segs.has(c._seg)) segs.set(c._seg, []); segs.get(c._seg).push(c); }
      for (const cs of segs.values()) {
        const x0 = cs[0].offsetLeft, w = cs.at(-1).offsetLeft + cs.at(-1).offsetWidth - x0;
        for (const c of cs) { c.style.setProperty('--gw', `${w}px`); c.style.setProperty('--gx', `${x0 - c.offsetLeft}px`); }
      }
    }
  }
  const visible = (el, l, at, out) => { el.style.visibility = l >= at - .01 && out < 1 ? 'visible' : 'hidden'; };

  // Characters arrive out of a soft blur one after another, and leave the same way at outAt.
  function reveal(el, l, at, { st = .035, d = .55, blur = 14, dy = 22, outAt = Infinity, outD = .4 } = {}) {
    const out = clamp((l - outAt) / outD);
    el._chars.forEach((c, i) => {
      const p = out3((l - at - i * st) / d);
      c.style.opacity = p * (1 - out);
      c.style.filter = `blur(${((1 - p) + out) * blur}px)`;
      c.style.transform = `translateY(${(1 - p) * dy - out * 10}px)`;
    });
    visible(el, l, at, out);
  }
  // Whole element: fade + rise (+ optional blur), and an optional exit.
  function show(el, l, at, { d = .6, dy = 30, outAt = Infinity, outD = .4, blur = 0, scale = 0 } = {}) {
    const p = out3((l - at) / d), o = clamp((l - outAt) / outD);
    el.style.opacity = p * (1 - o);
    el.style.transform = `translateY(${(1 - p) * dy}px)${scale ? ` scale(${1 - scale * (1 - p)})` : ''}`;
    el.style.filter = blur ? `blur(${(1 - p + o) * blur}px)` : '';
    el.style.clipPath = '';
  }
  // Masked rise: markup <div class="m"><span>text</span></div> with .m { overflow:hidden }.
  function maskIn(el, l, at, d = .75) { (el.firstElementChild ?? el).style.transform = `translateY(${(1 - out3((l - at) / d)) * 110}%)`; }
  function lockupDefault(el, l, at) {
    const p = out5((l - at) / .9);
    el.style.transform = `scale(${1.12 - .12 * p})`;
    const mark = $('svg', el); if (mark) mark.style.filter = `blur(${(1 - p) * 8}px)`;
    const name = $('.name', el); if (name?._chars) text(name, l, at, { st: .035, blur: 18, dy: 0 });
  }
  // Counts up to the exact value and stops there (no overshoot); digits keep a fixed width so the number doesn't jitter.
  function count(el, l, at, to, { d = 1.4, decimals = 0, prefix = '', suffix = '' } = {}) {
    el.style.fontVariantNumeric = 'tabular-nums';
    const k = out3((l - at) / d);
    el.textContent = `${prefix}${(k >= 1 ? to : to * k).toFixed(decimals)}${suffix}`;
  }
  function type(el, text, l, at, d, { caret = true, caretClass = 'caret' } = {}) {
    const k = clamp((l - at) / d);
    el.textContent = text.slice(0, Math.floor(text.length * k));
    if (caret && k < 1.02 && Math.floor(l * 2.2) % 2 === 0) { const c = document.createElement('i'); c.className = caretClass; el.append(c); }
  }
  // Wipe an element in from one side with clip-path (k 0 → 1). dir: 'l' | 'r' | 't' | 'b'.
  function wipe(el, k, dir = 'l') {
    const r = `${((1 - clamp(k)) * 100).toFixed(2)}%`;
    el.style.clipPath = k >= 1 ? '' : `inset(${dir === 'b' ? r : 0} ${dir === 'l' ? r : 0} ${dir === 't' ? r : 0} ${dir === 'r' ? r : 0})`;
  }
  // Draw an SVG path/line/rect stroke in (k 0 → 1).
  function stroke(el, k) {
    const len = el._len ?? (el._len = el.getTotalLength?.() ?? 1000);
    el.style.strokeDasharray = `${len}`; el.style.strokeDashoffset = `${len * (1 - clamp(k))}`;
  }

  // Starfield on a canvas: deterministic, slow parallax drift and twinkle. Returns draw(t).
  function starfield(canvas, { count: n = 560, seed = 11, drift = 9, rgb = '220,228,255' } = {}) {
    const ctx = canvas.getContext('2d'), r = rng(seed);
    const stars = Array.from({ length: n }, () => ({ x: r(), y: r(), z: .2 + r() * .8, ph: r() * 6.28, s: r() }));
    return (t) => {
      const W = canvas.width, H = canvas.height;
      for (const s of stars) {
        const x = ((s.x * W - t * drift * s.z) % W + W) % W, y = ((s.y * H + t * drift / 3 * s.z) % H + H) % H;
        ctx.fillStyle = `rgba(${rgb},${((.25 + .55 * s.z) * (.6 + .4 * Math.sin(t * (1 + s.s * 2) + s.ph))).toFixed(3)})`;
        const size = s.s > .96 ? 2.2 : s.z > .8 ? 1.6 : 1.1;
        ctx.fillRect(x, y, size, size);
      }
    };
  }
  // Particle swarm: gathers into (cx, cy) over `gather` s, bursts at T with a shock ring and flash.
  function swarm(canvas, { count: n = 1100, seed = 23, palette: pal = PAL, flash = '235,240,255', glow = '120,150,255' } = {}) {
    const ctx = canvas.getContext('2d'), r = rng(seed);
    const ps = Array.from({ length: n }, () => ({ a: r() * 6.283, r0: 160 + Math.pow(r(), .6) * 980, sp: .6 + r() * 1.4, c: pal[Math.floor(r() * pal.length)], s: .8 + r() * 2.2, v: 350 + r() * 1300 }));
    return (t, T, cx, cy, gather = 1.5) => {
      const u = t - T;
      if (u < -gather || u > 1.6) return;
      for (const p of ps) {
        let rad, ang, a;
        if (u < 0) { const k = Math.pow(clamp((u + gather) / gather), 2.2); rad = p.r0 * (1 - k) + 6; ang = p.a + (1 - k) * .4 + k * 2.6 * p.sp; a = clamp((u + gather) / .5) * (.5 + .5 * k); }
        else { rad = 10 + p.v * (1 - Math.exp(-u * 3.2)); ang = p.a + 2.6 * p.sp; a = Math.exp(-u * 2.4); }
        ctx.globalAlpha = clamp(a); ctx.fillStyle = p.c;
        ctx.fillRect(cx + Math.cos(ang) * rad * 1.25, cy + Math.sin(ang) * rad * .8, p.s, p.s);
      }
      ctx.globalAlpha = 1;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, u >= 0 ? 520 : 160);
      if (u >= 0) {
        const ring = 40 + u * 1500, ra = clamp(1 - u / .9);
        ctx.strokeStyle = `rgba(${glow},${(ra * .55).toFixed(3)})`; ctx.lineWidth = 3 * ra + .5;
        ctx.beginPath(); ctx.ellipse(cx, cy, ring * 1.25, ring * .8, 0, 0, 6.283); ctx.stroke();
        const fa = Math.exp(-u * 5) * .75;
        g.addColorStop(0, `rgba(${flash},${fa.toFixed(3)})`); g.addColorStop(.35, `rgba(${glow},${(fa * .35).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        const ca = Math.pow(clamp((u + gather) / gather), 3) * .6;
        g.addColorStop(0, `rgba(${flash},${ca.toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - 200, cy - 200, 400, 400);
      }
    };
  }

  // Curved links (SVG paths) that draw in, with two sparks travelling along each. defs: [{ d, c, at, speed?, until? }];
  // c may be a CSS colour or var(--cN) (it is set as a style property, so variables work).
  function links(svg, defs) {
    svg.innerHTML = defs.map(() => '<path class="lk" fill="none" stroke-width="2.2"/><circle class="sp" r="5"/><circle class="sp2" r="3.5"/>').join('');
    const paths = $$('path', svg), circles = $$('circle', svg);
    svg._links = paths.map((p, i) => {
      p.setAttribute('d', defs[i].d); p.style.stroke = defs[i].c; p.style.strokeOpacity = .55;
      circles[i * 2].style.fill = defs[i].c; circles[i * 2 + 1].style.fill = 'var(--ink)';
      return { p, len: p.getTotalLength(), sparks: circles.slice(i * 2, i * 2 + 2), ...defs[i] };
    });
  }
  function drawLinks(svg, l) {
    for (const k of svg._links) {
      const p = (S.draw ?? out3)((l - k.at) / .8);
      k.p.style.strokeDasharray = `${k.len}`; k.p.style.strokeDashoffset = `${k.len * (1 - p)}`;
      k.sparks.forEach((s, j) => {
        const on = l > k.at + .6 && l < (k.until ?? Infinity);
        const q = (((l - k.at) * (k.speed ?? .7) + j * .5) % 1 + 1) % 1;
        const pt = k.p.getPointAtLength(k.len * q);
        s.setAttribute('cx', pt.x); s.setAttribute('cy', pt.y);
        s.setAttribute('opacity', on && S.sparks !== false ? (j ? .8 : 1) * Math.sin(Math.PI * q) : 0);
      });
    }
  }
  // Coloured dots orbiting a centre inside an SVG <g> (viewBox units).
  function orbit(g, { cx = 75, cy = 75, r = 68, colors = [0, 1, 2, 3, 4, 5].map(color), speed = .9 } = {}) {
    g.innerHTML = colors.map(() => '<circle r="5"/>').join('');
    const dots = $$('circle', g);
    dots.forEach((d, i) => { d.style.fill = colors[i]; });
    return (t) => dots.forEach((d, i) => { const a = t * speed + i * 6.283 / dots.length; d.setAttribute('cx', cx + Math.cos(a) * r); d.setAttribute('cy', cy + Math.sin(a) * r); });
  }

  // Image sequences (frames extracted from a screen recording) and awaited decoding, so a frame never shows a half-loaded image.
  const frames = (dir, n, pad = 4, ext = 'jpg') => Array.from({ length: n }, (_, i) => `${dir}/${String(i + 1).padStart(pad, '0')}.${ext}`);
  // Failed decodes are recorded in window.__mediaErrors (check.mjs reports them) instead of rendering a blank frame silently.
  async function setSrc(img, src) {
    if (img.dataset.src === src) return;
    img.dataset.src = src; img.src = src;
    await img.decode().catch(() => { (window.__mediaErrors ??= []).push(src); });
  }

  // Burned-in subtitles from cues ({start, dur, text}): one per spoken sentence when tts.mjs had timings (vo.cues).
  // A cue longer than `max` characters is split at commas, timed by length inside the sentence. `max` defaults to what
  // fits 78% of the frame width at the subtitle's font size, at most 24.
  const subCues = (scenes) => scenes.filter((s) => s.vo).flatMap((s) => s.vo.cues ?? [{ start: s.vo.start, dur: s.vo.dur, text: s.vo.sub ?? s.vo.text }]);
  function subtitles(el, cues, t, { max } = {}) {
    max ??= Math.min(24, Math.floor(window.TIMELINE.width * .78 / (parseFloat(getComputedStyle(el).fontSize) || 40)));
    let cue = null;
    for (const c of cues) if (t >= c.start && t < c.start + c.dur + .25) cue = c;
    if (!cue) { el.style.opacity = 0; return; }
    const parts = cue.text.match(/[^，。：；！？,.;:!?]+[，。：；！？,.;:!?]?/g) ?? [cue.text];
    const chunks = []; let buf = '';
    for (const part of parts) { if ((buf + part).length > max && buf) { chunks.push(buf); buf = ''; } buf += part; }
    if (buf) chunks.push(buf);
    const total = chunks.reduce((n, c) => n + c.length, 0);
    let at = cue.start, text = chunks.at(-1);
    for (const c of chunks) { const len = cue.dur * c.length / total; if (t < at + len) { text = c; break; } at += len; }
    el.textContent = text.replace(/[，。；：,;:]$/, '');
    el.style.opacity = 1;
  }

  // ---- style layer ----
  let S = {};
  function useStyle(fallback = 'nebula', base = 'styles') {
    const TL = window.TIMELINE ?? {};
    const id = TL.style ?? fallback;
    const root = document.documentElement.style;
    if (TL.width) root.setProperty('--W', `${TL.width}px`);
    if (TL.height) root.setProperty('--H', `${TL.height}px`);
    // TIMELINE.brand (a stylesheet next to the film) loads after the style, so the brand's own values win.
    const brand = TL.brand ? `<link rel="stylesheet" href="${TL.brand}">` : '';
    document.write(`<link rel="stylesheet" href="${base}/${id}/theme.css">${brand}<script src="${base}/${id}/style.js"><\/script>`);
    K.styleId = id;
  }
  function defineStyle(def) { S = def; K.S = def; document.documentElement.dataset.style = def.id ?? K.styleId ?? ''; }
  const text = (el, l, at, o = {}) => (S.text ?? reveal)(el, l, at, o);
  const item = (el, l, at, o = {}) => (S.item ?? show)(el, l, at, o);
  const mask = (el, l, at, d = .75) => (S.mask ?? maskIn)(el, l, at, d);
  const lockup = (el, l, at) => (S.lockup ?? lockupDefault)(el, l, at);
  function hit(t, T, cx, cy, o = {}) {
    const c = $('#fx');
    if (!c) return;
    const ctx = c.getContext('2d');
    if (S.hit) return S.hit(ctx, t, T, cx, cy, o);
    c._swarm ??= swarm(c, { palette: palette().length ? palette() : PAL });
    c._swarm(t, T, cx, cy, o.gather ?? 1.5);
  }

  // Scene scheduler: shows the active <section id=scene.id> (display, never visibility: a visible child would leak through
  // a hidden parent), draws the style background on canvas#bg, calls RENDER[id](l, scene, t), clears canvas#fx, then
  // `after(t)` for overlays. fadeIn / fadeOut (s) run the style's scene transition. Sets window.render.
  function film(RENDER, { after, fadeIn = 0, fadeOut = 0, curtain } = {}) {
    const TL = window.TIMELINE;
    split();
    let first = true;
    const bg = $('#bg'), fx = $('#fx');
    window.render = async (t) => {
      if (first) {
        for (const c of $$('canvas.layer')) { c.width = TL.width; c.height = TL.height; }
        measure(); first = false;
        // A scene left out of the timeline (a cut-down, a draft) would otherwise stay on screen the whole film.
        const ids = new Set(TL.scenes.map((s) => s.id));
        for (const el of $$('.scene')) if (!ids.has(el.id)) el.style.display = 'none';
      }
      if (bg) { const ctx = bg.getContext('2d'); ctx.clearRect(0, 0, bg.width, bg.height); S.bg?.(ctx, t, bg.width, bg.height); }
      if (fx) fx.getContext('2d').clearRect(0, 0, fx.width, fx.height);
      for (const s of TL.scenes) {
        const el = document.getElementById(s.id);
        if (!el) continue;
        const l = t - s.start, on = l >= -.001 && l < s.dur;
        el.style.display = on ? '' : 'none';
        if (!on) continue;
        if (fadeIn || fadeOut) {
          const pin = s === TL.scenes[0] || !fadeIn ? 1 : clamp(l / fadeIn), pout = s === TL.scenes.at(-1) || !fadeOut ? 1 : clamp((s.dur - l) / fadeOut);
          const [p, phase] = pin < pout ? [pin, 'in'] : [pout, 'out'];
          if (S.scene) S.scene(el, p, phase); else el.style.opacity = out3(p);
        }
        await RENDER[s.id]?.(l, s, t);
      }
      if (after) await after(t);
      if (curtain) curtain.style.opacity = clamp((t - (TL.total - .9)) / .9);
    };
  }
  const scene = (id) => window.TIMELINE.scenes.find((s) => s.id === id);

  window.K = {
    clamp, out3, out5, inout, back, snap, steps, $, $$, rng, hash, PAL, cssVar, color, palette,
    split, measure, reveal, show, maskIn, count, type, wipe, stroke, starfield, swarm, links, drawLinks, orbit, frames, setSrc, subtitles, subCues,
    useStyle, defineStyle, text, item, mask, lockup, hit, film, scene, S,
  };
})();
