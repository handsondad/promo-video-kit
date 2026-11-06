// swiss 瑞士网格: characters rise out of a slot at the baseline with a precise ease (no fade, no overshoot), elements wipe in
// from the left and leave by a knife cut to their midline, scenes wipe, and the signature moment is a rule drawn across
// the page that turns into the signal colour.
(() => {
  const { clamp, snap } = K;
  const slot = (c, p, o) => {
    const settled = p >= 1 && o <= 0;
    c.style.transform = settled ? '' : `translateY(${((1 - p) - o) * 100}%)`;
    c.style.clipPath = settled ? '' : `inset(${o * 100}% 0 ${(1 - p) * 100}% 0)`;
  };
  K.defineStyle({
    id: 'swiss',
    draw: (x) => clamp(x),
    sparks: false,
    text(el, l, at, { st = .03, outAt = Infinity, outD = .3 } = {}) {
      el._chars.forEach((c, i) => {
        const p = snap((l - at - i * st * .7) / .36), o = snap((l - outAt - i * .008) / Math.min(outD, .3));
        slot(c, p, o); c.style.opacity = ''; c.style.filter = '';
      });
      el.style.visibility = l >= at - .01 && l < outAt + .5 ? 'visible' : 'hidden';
    },
    item(el, l, at, { d = .5, outAt = Infinity, outD = .3 } = {}) {
      const p = snap((l - at) / Math.min(d, .5)), o = snap((l - outAt) / Math.min(outD, .3));
      el.style.opacity = p > 0 && o < 1 ? 1 : 0;
      el.style.transform = ''; el.style.filter = '';
      el.style.clipPath = o > 0 ? `inset(${o * 50}% 0 ${o * 50}% 0)` : p < 1 ? `inset(0 ${(1 - p) * 100}% 0 0)` : '';
    },
    mask(el, l, at, d = .6) { (el.firstElementChild ?? el).style.transform = `translateY(${(1 - snap((l - at) / d)) * 110}%)`; },
    lockup(el, l, at) {
      const p = snap((l - at) / .45);
      el.style.transform = '';
      const mark = K.$('svg', el); if (mark) { mark.style.filter = ''; mark.style.clipPath = `inset(${(1 - p) * 100}% 0 0 0)`; }
      const name = K.$('.name', el); if (name?._chars) K.text(name, l, at + .1, { st: .03 });
    },
    scene(el, p, phase) {
      const k = (1 - snap(p)) * 100;
      el.style.clipPath = p >= 1 ? '' : phase === 'in' ? `inset(0 ${k}% 0 0)` : `inset(0 0 0 ${k}%)`;
      el.style.opacity = '';
    },
    hit(ctx, t, T, cx, cy) {
      const u = t - T, W = ctx.canvas.width, y = cy + 125, x0 = 120, x1 = W - 120;
      if (u < -.6 || u > 3.2) return;
      const draw = clamp((u + .6) / .6), thick = u < 0 ? 4 : 4 + 14 * snap(u / .25);
      const cut = snap((u - 2.6) / .4);
      ctx.fillStyle = u < 0 ? '#111111' : '#e30613';
      const h = thick * (1 - cut);
      if (h > .2) ctx.fillRect(x0, y - h / 2, (x1 - x0) * draw, h);
    },
  });
})();
