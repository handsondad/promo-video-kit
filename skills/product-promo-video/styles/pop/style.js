// pop 波普活力: characters pop in with an overshoot and a tilt that settles, cards bounce in and drop out, scenes open and
// close like an iris, and the signature moment pulls in three rings and fires a burst of outlined confetti.
(() => {
  const { clamp, back, out3, inout, hash, rng } = K;
  const COLS = ['#2f7bff', '#ff4fa3', '#1fbf5a', '#ff7a00', '#8b5cf6', '#ffffff'];
  K.defineStyle({
    id: 'pop',
    draw: out3,
    text(el, l, at, { st = .04, outAt = Infinity, outD = .3 } = {}) {
      const o = clamp((l - outAt) / outD);
      el._chars.forEach((c, i) => {
        const p = clamp((l - at - i * st) / .38), b = back(p, 2.2);
        c.style.opacity = clamp(p * 4) * (1 - o);
        c.style.transform = `translateY(${(1 - b) * 30 + o * 24}px) scale(${b * (1 - o * .6)}) rotate(${((hash(i, 9) - .5) * 26 * (1 - p)).toFixed(2)}deg)`;
        c.style.filter = '';
      });
      el.style.visibility = l >= at - .01 && o < 1 ? 'visible' : 'hidden';
    },
    item(el, l, at, { d = .5, outAt = Infinity, outD = .35, dy = 30 } = {}) {
      const p = clamp((l - at) / Math.min(d, .55)), o = inout((l - outAt) / outD), b = back(p, 1.9);
      el.style.opacity = clamp(p * 4) * (1 - o);
      el.style.transform = `translateY(${(1 - b) * Math.min(dy, 40) + o * 60}px) scale(${.7 + .3 * b}) rotate(${((1 - p) * -4 + o * 6).toFixed(2)}deg)`;
      el.style.filter = ''; el.style.clipPath = '';
    },
    mask(el, l, at, d = .6) { (el.firstElementChild ?? el).style.transform = `translateY(${(1 - back(clamp((l - at) / d), 1.8)) * 110}%)`; },
    lockup(el, l, at) {
      const p = clamp((l - at) / .55);
      el.style.transform = `scale(${.6 + .4 * back(p, 2.4)})`;
      const mark = K.$('svg', el); if (mark) { mark.style.filter = ''; mark.style.transform = `rotate(${((1 - back(p, 2)) * -30).toFixed(2)}deg)`; }
      const name = K.$('.name', el); if (name?._chars) K.text(name, l, at + .05, { st: .035 });
    },
    scene(el, p) {
      el.style.clipPath = p >= 1 ? '' : `circle(${(out3(p) * 120).toFixed(2)}% at 50% 50%)`;
      el.style.opacity = '';
    },
    hit(ctx, t, T, cx, cy) {
      const u = t - T;
      if (u < -.45 || u > 2.2) return;
      ctx.lineJoin = 'round';
      if (u < 0) {
        const k = out3((u + .45) / .45);
        ctx.strokeStyle = '#121212'; ctx.lineWidth = 10;
        for (let j = 0; j < 3; j += 1) { ctx.beginPath(); ctx.arc(cx, cy, (1 - k) * (520 + j * 160) + 20, 0, 6.283); ctx.stroke(); }
        return;
      }
      const r = rng(17);
      for (let i = 0; i < 70; i += 1) {
        const a = r() * 6.283, v = 600 + r() * 900, spin = (r() - .5) * 12, kind = Math.floor(r() * 4), col = COLS[Math.floor(r() * COLS.length)], s = 18 + r() * 22;
        const x = cx + Math.cos(a) * v * u * 1.25, y = cy + Math.sin(a) * v * u * .8 + 900 * u * u;
        const al = clamp(1 - (u - 1.4) / .8);
        if (al <= 0) continue;
        ctx.save(); ctx.globalAlpha = al; ctx.translate(x, y); ctx.rotate(spin * u);
        ctx.fillStyle = col; ctx.strokeStyle = '#121212'; ctx.lineWidth = 3.5;
        ctx.beginPath();
        if (kind === 0) ctx.arc(0, 0, s / 2, 0, 6.283);
        else if (kind === 1) ctx.rect(-s / 2, -s / 2, s, s);
        else if (kind === 2) { ctx.moveTo(0, -s / 1.6); ctx.lineTo(s / 1.8, s / 2.4); ctx.lineTo(-s / 1.8, s / 2.4); ctx.closePath(); }
        else { ctx.moveTo(-s, 0); for (let z = 1; z <= 4; z += 1) ctx.lineTo(-s + z * s / 2, z % 2 ? -s / 3 : s / 3); }
        if (kind === 3) { ctx.lineWidth = 6; ctx.strokeStyle = col; ctx.stroke(); } else { ctx.fill(); ctx.stroke(); }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    },
  });
})();
