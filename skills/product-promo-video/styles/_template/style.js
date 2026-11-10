// __slug__ __name__: one line on how things move. Every hook is optional; a missing hook falls back to the kit default
// (soft-blur reveal, rise-in, mask rise, blur lockup, particle swarm). Hooks run once per frame and must be pure
// functions of time: no Math.random, no counters, no state that depends on call order.
(() => {
  const { clamp, out3, inout } = K;
  K.defineStyle({
    id: '__slug__',
    // easing for links drawn by K.drawLinks; sparks: false turns off the travelling dots
    draw: out3,
    // characters of a [data-split] element; el._chars are the spans. Clear transform / clipPath once settled.
    text(el, l, at, { st = .03, outAt = Infinity, outD = .4 } = {}) {
      const o = clamp((l - outAt) / outD);
      el._chars.forEach((c, i) => {
        const p = out3((l - at - i * st) / .5);
        c.style.opacity = p * (1 - o);
        c.style.transform = p < 1 ? `translateY(${(1 - p) * 18}px)` : '';
        c.style.filter = '';
      });
      el.style.visibility = l >= at - .01 && o < 1 ? 'visible' : 'hidden';
    },
    // a whole element: card, pill, row. Templates may pass dy, scale, blur, d (duration), outAt, outD.
    item(el, l, at, { d = .6, dy = 24, outAt = Infinity, outD = .4 } = {}) {
      const p = out3((l - at) / d), o = clamp((l - outAt) / outD);
      el.style.opacity = p * (1 - o);
      el.style.transform = `translateY(${(1 - p) * dy}px)`;
      el.style.filter = ''; el.style.clipPath = '';
    },
    // a line that rises out of its .m mask; move the first child only
    mask(el, l, at, d = .7) { (el.firstElementChild ?? el).style.transform = `translateY(${(1 - out3((l - at) / d)) * 105}%)`; },
    // the logo lockup: the template sets the lockup's opacity, this sets the motion of the mark (svg) and the .name
    lockup(el, l, at) {
      const p = out3((l - at) / .7);
      el.style.transform = `scale(${1.06 - .06 * p})`;
      const mark = K.$('svg', el); if (mark) { mark.style.filter = ''; mark.style.opacity = p; }
      const name = K.$('.name', el); if (name?._chars) K.text(name, l, at + .1, { st: .03 });
    },
    // scene entrance / exit when TIMELINE scenes set fadeIn / fadeOut; p runs 0 → 1, phase is 'in' or 'out'.
    // Use opacity, clip-path or filter, never transform (templates push scenes with transform).
    scene(el, p) { el.style.opacity = inout(p); },
    // full-frame background on canvas#bg, drawn every frame under the scenes
    // bg(ctx, t, W, H) { },
    // the signature moment on canvas#fx (cleared every frame), centred on (cx, cy), peaking at time T
    hit(ctx, t, T, cx, cy) {
      const u = t - T;
      if (u < 0 || u > 1.5) return;
      const k = out3(u / 1.2), a = clamp(1 - u / 1.5);
      ctx.strokeStyle = `rgba(255,255,255,${(.6 * a).toFixed(3)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(cx, cy, 40 + k * 700, 0, 6.283); ctx.stroke();
    },
  });
})();
