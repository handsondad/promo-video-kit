// blueprint 蓝图工程: characters are plotted left to right, boxes are drafted in (linear wipe), scenes cross-fade like an
// overlay sheet, and the signature moment draws a construction circle and crosshair, then a dimension line with a label.
(() => {
  const { clamp, out3, inout } = K;
  const INK = '238,245,255', PEN = '255,209,102';
  let cssLabel;
  K.defineStyle({
    id: 'blueprint',
    draw: (x) => clamp(x),
    text(el, l, at, { st = .03, outAt = Infinity, outD = .4 } = {}) {
      const o = clamp((l - outAt) / outD);
      el._chars.forEach((c, i) => {
        const p = clamp((l - at - i * st) / .12);
        c.style.clipPath = p < 1 ? `inset(0 ${(1 - p) * 100}% 0 0)` : '';
        c.style.opacity = p > 0 ? 1 - o : 0;
        c.style.transform = ''; c.style.filter = '';
      });
      el.style.visibility = l >= at - .01 && o < 1 ? 'visible' : 'hidden';
    },
    item(el, l, at, { d = .6, outAt = Infinity, outD = .4 } = {}) {
      const p = clamp((l - at) / d), o = clamp((l - outAt) / outD);
      el.style.opacity = p > 0 ? 1 - o : 0;
      el.style.transform = ''; el.style.filter = '';
      el.style.clipPath = p < 1 ? `inset(0 ${(1 - p) * 100}% ${(1 - Math.min(1, p * 3)) * 100}% 0)` : '';
    },
    mask(el, l, at, d = .7) {
      const s = el.firstElementChild ?? el, p = clamp((l - at) / d);
      s.style.transform = ''; s.style.clipPath = p < 1 ? `inset(0 ${(1 - p) * 100}% 0 0)` : '';
    },
    lockup(el, l, at) {
      const p = clamp((l - at) / .6);
      el.style.transform = '';
      const mark = K.$('svg', el); if (mark) { mark.style.filter = ''; mark.style.clipPath = p < 1 ? `inset(${(1 - p) * 100}% 0 0 0)` : ''; }
      const name = K.$('.name', el); if (name?._chars) K.text(name, l, at + .15, { st: .035 });
    },
    scene(el, p) { el.style.opacity = inout(p); },
    hit(ctx, t, T, cx, cy) {
      const u = t - T;
      if (u < -1.2 || u > 4) return;
      const fade = 1 - .65 * clamp((u - 1.2) / .8) - .35 * clamp((u - 3.4) / .6);
      const k = out3((u + 1.2) / 1.1), R = 300;
      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(${INK},${(.55 * fade).toFixed(3)})`; ctx.lineWidth = 1.5;
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + k * 6.283); ctx.stroke();
      ctx.setLineDash([10, 8]);
      const e = k * (R + 140);
      ctx.beginPath(); ctx.moveTo(cx - e, cy); ctx.lineTo(cx + e, cy); ctx.moveTo(cx, cy - e * .8); ctx.lineTo(cx, cy + e * .8); ctx.stroke();
      ctx.setLineDash([]);
      if (u < 0) return;
      const d = out3(u / .7), y = cy + R + 40, half = (R + 140) * d;
      ctx.strokeStyle = `rgba(${PEN},${(.95 * fade).toFixed(3)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - half, y); ctx.lineTo(cx + half, y);
      for (const s of [-1, 1]) { const x = cx + s * half; ctx.moveTo(x, y - 14); ctx.lineTo(x, y + 14); ctx.moveTo(x, y); ctx.lineTo(x - s * 16, y - 7); ctx.moveTo(x, y); ctx.lineTo(x - s * 16, y + 7); }
      ctx.stroke();
      // Opt-in through `--hit-label: "v2.0"` in the film's CSS: an invented figure on screen reads as data.
      const label = (cssLabel ??= K.cssVar('--hit-label').replace(/^["']|["']$/g, ''));
      if (!label) return;
      ctx.fillStyle = `rgba(${PEN},${(clamp((u - .5) / .3) * fade).toFixed(3)})`;
      ctx.font = '500 22px Cascadia Mono, Consolas, monospace'; ctx.textAlign = 'center';
      ctx.fillText(label, cx, y - 18);
    },
  });
})();
