// editorial 杂志纸本: unhurried soft rises without blur, slow cross-fades, and a quiet signature moment: a hairline rule
// drawn out from the centre under the lockup, with a small diamond at each end.
(() => {
  const { clamp, inout, out3 } = K;
  const INK = '31,26,22', ACC = '194,80,46';
  K.defineStyle({
    id: 'editorial',
    draw: inout,
    sparks: false,
    text(el, l, at, { st = .03, outAt = Infinity, outD = .5 } = {}) {
      const o = inout((l - outAt) / outD);
      el._chars.forEach((c, i) => {
        const p = inout((l - at - i * st * .8) / .8);
        c.style.opacity = p * (1 - o);
        c.style.transform = `translateY(${(1 - p) * 16}px)`;
        c.style.filter = '';
      });
      el.style.visibility = l >= at - .01 && o < 1 ? 'visible' : 'hidden';
    },
    item(el, l, at, { d = .9, dy = 20, outAt = Infinity, outD = .5 } = {}) {
      const p = inout((l - at) / Math.max(d, .8)), o = inout((l - outAt) / outD);
      el.style.opacity = p * (1 - o);
      el.style.transform = `translateY(${(1 - p) * Math.min(dy, 22)}px)`;
      el.style.filter = ''; el.style.clipPath = '';
    },
    mask(el, l, at, d = .9) { (el.firstElementChild ?? el).style.transform = `translateY(${(1 - inout((l - at) / (d * 1.2))) * 105}%)`; },
    lockup(el, l, at) {
      const p = inout((l - at) / 1.1);
      el.style.transform = `translateY(${(1 - p) * 14}px)`;
      const mark = K.$('svg', el); if (mark) { mark.style.filter = ''; mark.style.opacity = p; }
      const name = K.$('.name', el); if (name?._chars) K.text(name, l, at + .1, { st: .03 });
    },
    scene(el, p) { el.style.opacity = inout(p); },
    hit(ctx, t, T, cx, cy) {
      const u = t - T;
      if (u < -.4 || u > 3.4) return;
      const k = inout((u + .4) / 1.2), fade = 1 - clamp((u - 2.9) / .5), half = 520 * k, y = cy + 120;
      ctx.strokeStyle = `rgba(${INK},${(.75 * fade).toFixed(3)})`; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y); ctx.stroke();
      const dk = out3((u - .6) / .5) * fade;
      if (dk > 0) {
        ctx.fillStyle = `rgba(${ACC},${dk.toFixed(3)})`;
        for (const s of [-1, 1]) {
          const x = cx + s * (half + 16), r = 7 * dk;
          ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill();
        }
      }
    },
  });
})();
