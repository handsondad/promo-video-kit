// whiteboard 白板手绘: letters are written one by one with a slight hand tilt, boxes are drawn in and stay a little crooked,
// scenes are wiped away like an eraser, and the signature moment circles the lockup with a red marker.
(() => {
  const { clamp, inout, out3, hash } = K;
  // Wobbly lines for boxes: one shared, fixed-seed displacement filter (deterministic, never animated).
  document.addEventListener('DOMContentLoaded', () => {
    document.body.insertAdjacentHTML('afterbegin', '<svg width="0" height="0" style="position:absolute" aria-hidden="true"><filter id="wb-rough" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".022" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="5"/></filter></svg>');
  });
  const seedOf = (el) => el._seed ?? (el._seed = [...(el.textContent || '')].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, el.offsetLeft * 7 + el.offsetTop * 13 + 1));
  const tilt = (el, k = 1.2) => (hash(seedOf(el), 3) - .5) * k;
  K.defineStyle({
    id: 'whiteboard',
    draw: inout,
    sparks: false,
    text(el, l, at, { st = .055, outAt = Infinity, outD = .35 } = {}) {
      const seed = seedOf(el), o = clamp((l - outAt) / outD), s = Math.max(st, .05);
      el._chars.forEach((c, i) => {
        const p = clamp((l - at - i * s) / .09);
        c.style.opacity = p;
        c.style.transform = `rotate(${((hash(i, seed) - .5) * 4).toFixed(2)}deg) scale(${1 + .18 * (1 - p)})`;
        c.style.filter = '';
      });
      el.style.clipPath = o > 0 ? `inset(0 0 0 ${o * 100}%)` : '';
      el.style.visibility = l >= at - .01 && o < 1 ? 'visible' : 'hidden';
    },
    item(el, l, at, { d = .55, outAt = Infinity, outD = .35 } = {}) {
      const p = inout((l - at) / d), o = clamp((l - outAt) / outD);
      el.style.opacity = p > 0 && o < 1 ? 1 : 0;
      el.style.transform = `rotate(${(tilt(el) + (1 - p) * -1.5).toFixed(2)}deg)`;
      el.style.filter = '';
      el.style.clipPath = o > 0 ? `inset(-20px -20px -20px calc(${o * 100}% - 20px))` : p < 1 ? `inset(-20px calc(${(1 - p) * 100}% - 20px) -20px -20px)` : '';
    },
    mask(el, l, at, d = .7) {
      const s = el.firstElementChild ?? el, p = inout((l - at) / d);
      s.style.transform = `rotate(${tilt(el, .8).toFixed(2)}deg)`; s.style.clipPath = p < 1 ? `inset(-10px ${(1 - p) * 100}% -10px -10px)` : '';
    },
    lockup(el, l, at) {
      const p = inout((l - at) / .5);
      el.style.transform = '';
      const mark = K.$('svg', el); if (mark) { mark.style.filter = ''; mark.style.clipPath = p < 1 ? `inset(0 ${(1 - p) * 100}% 0 0)` : ''; }
      const name = K.$('.name', el); if (name?._chars) K.text(name, l, at + .15, { st: .06 });
    },
    scene(el, p, phase) {
      const k = (1 - inout(p)) * 100;
      el.style.clipPath = p >= 1 ? '' : phase === 'out' ? `inset(0 0 0 ${k}%)` : '';
      el.style.opacity = phase === 'in' ? out3(p) : 1;
    },
    hit(ctx, t, T, cx, cy) {
      const u = t - T;
      if (u < -.25 || u > 3) return;
      const k = inout((u + .25) / .8), fade = 1 - clamp((u - 2.6) / .4), loops = 1.12;
      ctx.strokeStyle = `rgba(224,53,43,${(.92 * fade).toFixed(3)})`; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      const n = Math.floor(240 * k);
      for (let i = 0; i <= n; i += 1) {
        const s = i / 240 * loops, a = -2.6 + s * 6.283;
        const rx = 640 * (1 + .035 * Math.sin(3 * a + 1.3) + .03 * s), ry = 200 * (1 + .06 * Math.sin(2 * a + .4) + .05 * s);
        const x = cx + Math.cos(a) * rx, y = cy + 10 + Math.sin(a) * ry;
        if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }
      ctx.stroke();
      const tk = clamp((u - .55) / .25);
      if (tk > 0) {
        ctx.lineWidth = 6;
        for (const [dx, dy, a] of [[-700, -230, -2.4], [-735, -150, -2.75], [-735, -60, -3.05]]) {
          const x0 = cx + dx, y0 = cy + dy, L = 46 * tk;
          ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + Math.cos(a) * L, y0 + Math.sin(a) * L); ctx.stroke();
        }
      }
    },
  });
})();
