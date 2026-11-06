// nebula 星云玻璃: soft-blur character reveals, glass cards rising, a slow starfield, particles that gather and burst.
// The kit defaults (K.reveal / K.show / K.maskIn / K.swarm) are this style, so only the background is defined here.
(() => {
  let stars;
  K.defineStyle({
    id: 'nebula',
    bg(ctx, t) { stars ??= K.starfield(ctx.canvas); stars(t); },
  });
})();
