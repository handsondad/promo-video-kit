// keynote 暗场发布会: a light band switches characters on, UI drops in with one small overshoot and leaves by collapsing to a
// line, scenes expand / collapse like interface panels, and the signature moment is a light sweep with a thin accent ring.
(() => {
  const { clamp, out3, out5, back, snap } = K;
  const ACCENT = '183,243,74';
  K.defineStyle({
    id: 'keynote',
    draw: out5,
    text(el, l, at, { st = .03, outAt = Infinity, outD = .3 } = {}) {
      const n = el._chars.length;
      el._chars.forEach((c, i) => {
        const p = clamp((l - at - i * st * .8) / .22), o = clamp((l - outAt - (n - 1 - i) * .012) / .12);
        c.style.opacity = p * (1 - o);
        c.style.filter = p < 1 ? `brightness(${1 + 1.6 * p * (1 - p)})` : '';
        c.style.transform = `translateY(${(1 - back(p, 1.3)) * 10 - o * 6}px)`;
      });
      el.style.visibility = l >= at - .01 && l < outAt + outD + n * .012 ? 'visible' : 'hidden';
    },
    item(el, l, at, { d = .5, dy = 24, outAt = Infinity, outD = .3, scale = 0 } = {}) {
      const p = clamp((l - at) / Math.min(d, .45)), o = clamp((l - outAt) / outD);
      el.style.opacity = clamp(p * 2) * (1 - clamp((o - .55) / .45));
      el.style.transform = `translateY(${(1 - back(p, 1.3)) * dy * .7}px) scale(${(1 - (scale || .03) * (1 - back(p, 1.3)))}) scaleY(${1 - .97 * snap(o)})`;
      el.style.filter = o > 0 ? `brightness(${1 + o * 1.5})` : '';
      el.style.clipPath = '';
    },
    mask(el, l, at, d = .6) { (el.firstElementChild ?? el).style.transform = `translateY(${(1 - back(clamp((l - at) / d), 1.2)) * 105}%)`; },
    lockup(el, l, at) {
      const p = clamp((l - at) / .5);
      const mark = K.$('svg', el); if (mark) { mark.style.transform = `scale(${.9 + .1 * back(p, 1.4)})`; mark.style.opacity = clamp(p * 2); mark.style.filter = ''; }
      el.style.transform = '';
      const name = K.$('.name', el); if (name?._chars) K.text(name, l, at + .08, { st: .03 });
    },
    scene(el, p) {
      const k = 50 * (1 - out3(p));
      el.style.clipPath = p >= 1 ? '' : `inset(${k}% 0 ${k}% 0)`;
      el.style.opacity = p > .02 ? 1 : 0;
    },
    hit(ctx, t, T, cx, cy) {
      const u = t - T, W = ctx.canvas.width;
      if (u < -.8 || u > 2) return;
      if (u < 0) {
        const k = out3((u + .8) / .8), r = 420 * (1 - k) + 8;
        ctx.strokeStyle = `rgba(255,255,255,${(.35 * k).toFixed(3)})`; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, 6.283); ctx.stroke();
        ctx.fillStyle = `rgba(${ACCENT},${(.9 * k).toFixed(3)})`; ctx.beginPath(); ctx.arc(cx, cy, 3 + 3 * k, 0, 6.283); ctx.fill();
        return;
      }
      const sx = -300 + out3(u / 1.1) * (W + 600);
      const band = ctx.createLinearGradient(sx - 260, 0, sx + 260, 0);
      band.addColorStop(0, 'rgba(255,255,255,0)'); band.addColorStop(.5, `rgba(255,255,255,${(.11 * clamp(1 - u / 1.1)).toFixed(3)})`); band.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = band; ctx.fillRect(sx - 260, cy - 260, 520, 520);
      const ra = clamp(1 - u / 1.4), rr = 30 + out5(u / 1.4) * 900;
      ctx.strokeStyle = `rgba(${ACCENT},${(.7 * ra).toFixed(3)})`; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.283); ctx.stroke();
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, 520);
      g.addColorStop(0, `rgba(${ACCENT},${(.16 * Math.exp(-u * 2.5)).toFixed(3)})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(cx - 520, cy - 520, 1040, 1040);
    },
  });
})();
