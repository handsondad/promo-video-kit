// terminal 终端荧光: text is typed at a fixed rate behind a block cursor and leaves by backspacing, panels flicker on in
// steps and switch off like a CRT (collapse to a line), and the signature moment is a scanline pass then a burst of glyphs.
(() => {
  const { clamp, steps, rng } = K;
  const GREEN = '57,255,136';
  const FLICK = [0, .7, .15, .9, .4, 1];
  K.defineStyle({
    id: 'terminal',
    draw: (x) => steps(x, 12),
    text(el, l, at, { st = .035, outAt = Infinity } = {}) {
      const n = el._chars.length, s = Math.max(st, .03);
      const shown = Math.min(n, Math.floor((l - at) / s) + 1), gone = l >= outAt ? Math.floor((l - outAt) / .014) + 1 : 0;
      const last = Math.min(shown, n - gone) - 1, typing = l >= at && shown < n && l < outAt;
      el._chars.forEach((c, i) => {
        const on = l >= at && i < shown && i < n - gone;
        c.style.opacity = on ? 1 : 0;
        c.style.transform = ''; c.style.filter = '';
        const cur = typing && i === last;
        c.style.background = cur ? 'var(--accent)' : ''; c.style.color = cur ? 'var(--bg)' : ''; c.style.webkitTextFillColor = cur ? 'var(--bg)' : '';
      });
      el.style.visibility = l >= at - .01 && gone < n ? 'visible' : 'hidden';
    },
    item(el, l, at, { outAt = Infinity, outD = .3 } = {}) {
      const p = clamp((l - at) / .3), o = clamp((l - outAt) / Math.min(outD, .3));
      el.style.opacity = (p >= 1 ? 1 : FLICK[Math.floor(p * FLICK.length)]) * (o < .6 ? 1 : 1 - (o - .6) / .4);
      el.style.transform = o > 0 ? `scaleY(${1 - .98 * clamp(o / .6)})` : '';
      el.style.filter = o > 0 ? `brightness(${1 + 2 * o})` : '';
      el.style.clipPath = '';
    },
    mask(el, l, at, d = .5) { (el.firstElementChild ?? el).style.transform = `translateY(${(1 - steps((l - at) / d, 4)) * 110}%)`; },
    lockup(el, l, at) {
      el.style.transform = '';
      const mark = K.$('svg', el), p = clamp((l - at) / .3);
      if (mark) { mark.style.filter = ''; mark.style.opacity = p >= 1 ? 1 : FLICK[Math.floor(p * FLICK.length)]; }
      const name = K.$('.name', el); if (name?._chars) K.text(name, l, at + .1, { st: .045 });
    },
    scene(el, p, phase) {
      if (phase === 'in') { el.style.opacity = p >= 1 ? 1 : FLICK[Math.floor(p * FLICK.length)]; el.style.clipPath = ''; return; }
      const k = (1 - p) * 50;
      el.style.clipPath = p >= 1 ? '' : `inset(${k}% 0 ${k}% 0)`; el.style.opacity = 1;
    },
    bg(ctx, t, W, H) {
      const y = (t * 140) % (H + 300) - 150;
      const g = ctx.createLinearGradient(0, y - 150, 0, y + 150);
      g.addColorStop(0, `rgba(${GREEN},0)`); g.addColorStop(.5, `rgba(${GREEN},.035)`); g.addColorStop(1, `rgba(${GREEN},0)`);
      ctx.fillStyle = g; ctx.fillRect(0, y - 150, W, 300);
    },
    hit(ctx, t, T, cx, cy) {
      const u = t - T;
      if (u < -.5 || u > 1.6) return;
      if (u < 0) {
        const y = cy - 260 + 520 * clamp((u + .5) / .5);
        ctx.fillStyle = `rgba(${GREEN},.85)`; ctx.fillRect(cx - 700, y, 1400, 2);
        ctx.fillStyle = `rgba(${GREEN},.08)`; ctx.fillRect(cx - 700, y - 60, 1400, 60);
        return;
      }
      const r = rng(5), glyphs = '01#$%&*+=<>/\\|{}[];:~^';
      ctx.font = '700 24px Cascadia Mono, Consolas, monospace'; ctx.textAlign = 'center';
      for (let i = 0; i < 280; i += 1) {
        const a = r() * 6.283, v = 300 + r() * 900, ch = glyphs[Math.floor(r() * glyphs.length)], life = .7 + r() * .9;
        const k = 1 - Math.exp(-u * 3.2), al = clamp(1 - u / life);
        if (al <= 0) continue;
        ctx.fillStyle = `rgba(${GREEN},${al.toFixed(3)})`;
        ctx.fillText(ch, cx + Math.cos(a) * v * k * 1.3, cy + Math.sin(a) * v * k * .75);
      }
    },
  });
})();
