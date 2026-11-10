// Deterministic synth score (no samples, no licensing): pad, bass, drums, hats, arpeggio, ticks, whooshes and impacts, in
// one of several sound palettes so the score belongs to the film's style.
//   node music.mjs --timeline timeline.json --cues cues.json --out score.wav [--sfx sfx.wav]
// --sfx writes the ticks, whooshes and impacts to their own file; give both to mix.mjs so only the bed ducks.
// cues.json (times are seconds, or scene-relative strings "logo", "logo+1.0", "outro-0.5"; "start" and "end" are the
// film's edges unless a scene has that id, and then they are that scene's start):
//   { palette: "synth"|"mallet"|"motorik"|"felt"|"chip"|"ambient"|"pop", bpm, mood: "minor"|"bright", voices: { arp: "piano", … },
//     grid: "logo+1.0", impacts: [...], whooshes: [...], ticks: [...], groove: [from,to], hats: [from,to], arp: [from,to], breath: [from,to],
//     lag: 0.033 }
// groove = bass + kick (+ snare/clap on 2 and 4 where the palette has one); hats = hats/shaker/brush; arp = the melodic pattern.
// Every tick, whoosh and impact needs a visible cause at its time; they land `lag` (default one frame) after it, and
// repeated ticks and whooshes rotate through three takes.
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { arg, normalizeTimeline, readJson } from './lib.mjs';

const SR = 48000;
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);
const PROGRESSIONS = {
  // Am9 → Fmaj7 → C(add9) → G6: calm, confident, "tech launch".
  minor: [{ root: 45, tones: [57, 60, 64, 67, 71] }, { root: 41, tones: [53, 57, 60, 64, 69] }, { root: 48, tones: [55, 60, 62, 64, 67] }, { root: 43, tones: [55, 59, 62, 64, 67] }],
  // Cmaj9 → G6 → Am7 → Fmaj9: brighter, optimistic.
  bright: [{ root: 48, tones: [55, 60, 64, 67, 71] }, { root: 43, tones: [55, 59, 62, 64, 67] }, { root: 45, tones: [57, 60, 64, 67, 72] }, { root: 41, tones: [57, 60, 64, 65, 67] }],
};
// Each palette names one timbre per voice; cues.voices overrides any of them.
export const PALETTES = {
  synth: { bpm: 100, pad: 'saw', bass: 'sub', kick: 'deep', snare: null, hat: 'hat8', arp: 'sine', arpRate: 4, tick: 'bell', whoosh: 'air', impact: 'boom' },
  mallet: { bpm: 104, pad: 'sine', bass: 'sub', kick: 'felt', snare: null, hat: 'shaker', arp: 'marimba', arpRate: 4, tick: 'glass', whoosh: 'air', impact: 'chord' },
  motorik: { bpm: 120, pad: 'organ', bass: 'pulse', kick: 'tight', snare: 'snare', hat: 'hat8', arp: 'pluck', arpRate: 4, tick: 'click', whoosh: 'slide', impact: 'stamp' },
  felt: { bpm: 84, pad: 'warm', bass: 'sine', kick: null, snare: null, hat: 'brush', arp: 'piano', arpRate: 2, tick: 'piano', whoosh: 'paper', impact: 'piano', mood: 'bright' },
  chip: { bpm: 132, pad: 'organ', bass: 'triangle', kick: 'chip', snare: 'noise', hat: 'hat8', arp: 'square', arpRate: 4, tick: 'blip', whoosh: 'sweep', impact: 'chip' },
  ambient: { bpm: 76, pad: 'drone', bass: null, kick: null, snare: null, hat: null, arp: 'glass', arpRate: 2, tick: 'tick', whoosh: 'air', impact: 'swell' },
  pop: { bpm: 118, pad: 'bright', bass: 'pulse', kick: 'tight', snare: 'clap', hat: 'hat8', arp: 'pluck', arpRate: 4, tick: 'pop', whoosh: 'zip', impact: 'boom', mood: 'bright' },
};
const PADS = {
  saw: { h: [1, 1 / 3.4, 1 / 7.4, 1 / 13, 1 / 20.2], det: .07, gain: .05, lp: .18 },
  sine: { h: [1, .12], det: .05, gain: .075, lp: .25 },
  warm: { h: [1, .4, .15], det: .06, gain: .06, lp: .12 },
  organ: { h: [1, 0, .35, 0, .15], det: .04, gain: .05, lp: .2 },
  bright: { h: [1, .5, .33, .25, .2], det: .08, gain: .038, lp: .3 },
  drone: { h: [1, .3, .1], det: .04, gain: .085, lp: .08, drone: true },
};
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const smooth = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
const inRange = (t, [a, b], fade = 1.2) => smooth((t - a) / fade) * (1 - smooth((t - b) / fade));
const TAU = 2 * Math.PI;

export function resolveCues(cues, timeline) {
  const tl = normalizeTimeline(timeline);
  const at = (v) => {
    if (typeof v === 'number') return v;
    const m = /^([\w-]+)\s*([+-]\s*[\d.]+)?$/.exec(String(v).trim());
    if (!m) throw new Error(`bad cue ${v}`);
    const base = tl.scenes.find((s) => s.id === m[1])?.start ?? (m[1] === 'end' ? tl.total : m[1] === 'start' ? 0 : undefined);
    if (base === undefined) throw new Error(`cue ${v}: no scene ${m[1]}`);
    return base + (m[2] ? Number(m[2].replace(/\s/g, '')) : 0);
  };
  const out = { ...cues, total: tl.total };
  for (const k of ['grid']) if (cues[k] !== undefined) out[k] = at(cues[k]);
  for (const k of ['impacts', 'whooshes', 'ticks', 'groove', 'hats', 'arp', 'breath']) if (cues[k]) out[k] = cues[k].map(at);
  // A hit reads as caused by the picture when it lands one frame after it; "lag": 0 puts it on the frame.
  const lag = cues.lag ?? 1 / tl.fps;
  for (const k of ['impacts', 'whooshes', 'ticks']) if (out[k]) out[k] = out[k].map((t) => t + lag);
  return out;
}

// With sfxFile the ticks, whooshes and impacts go to their own file (same scale as the bed, so bed + sfx = the score),
// letting mix.mjs duck the bed under the voice without ducking the hits.
export function writeScore(file, cue, sfxFile = null) {
  const P = { ...PALETTES[cue.palette ?? 'synth'], ...(cue.voices ?? {}) };
  if (!PALETTES[cue.palette ?? 'synth']) throw new Error(`palette ${cue.palette}: expected ${Object.keys(PALETTES).join(' | ')}`);
  const BEAT = 60 / (cue.bpm ?? P.bpm ?? 100), BAR = BEAT * 4;
  const CHORDS = PROGRESSIONS[cue.mood ?? P.mood ?? 'minor'];
  const grid = cue.grid ?? 0;
  const n = Math.ceil(cue.total * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const FL = sfxFile ? new Float32Array(n) : L, FR = sfxFile ? new Float32Array(n) : R;
  let toL = L, toR = R;
  const rand = rng(7);
  const chordAt = (t) => CHORDS[Math.floor(Math.max(0, t) / (BAR * 2)) % CHORDS.length];
  const breathOf = (t, f = .6) => (cue.breath ? inRange(t, cue.breath, f) : 0);
  const add = (t0, len, fn, pan = .5) => {
    const a = Math.max(0, Math.floor(t0 * SR)), b = Math.min(n, Math.floor((t0 + len) * SR));
    for (let i = a; i < b; i += 1) { const s = fn((i - a) / SR); toL[i] += s * (1 - pan) * 2; toR[i] += s * pan * 2; }
  };
  const noise = () => rand() * 2 - 1;

  // Pads: additive voices per chord tone, each chord keeps its own oscillator phases, cross-faded at the change.
  const pad = PADS[P.pad];
  if (pad) {
    const voicing = (c) => (pad.drone ? [c.root + 12, c.root + 19, c.root + 24] : c.tones);
    const phases = new Float64Array(CHORDS.length * 12);
    let lpL = 0, lpR = 0;
    for (let i = 0; i < n; i += 1) {
      const t = i / SR, k = Math.floor(t / (BAR * 2)), blend = smooth((t - k * BAR * 2) / (pad.drone ? 2.5 : .9));
      let l = 0, r = 0;
      for (const [ci, w] of [[(k + 3) % 4, k ? 1 - blend : 0], [k % 4, k ? blend : 1]]) {
        if (w < 1e-3) continue;
        let p = ci * 12;
        voicing(CHORDS[ci]).forEach((m, v) => {
          for (const det of [-pad.det, pad.det]) {
            phases[p] = (phases[p] + hz(m) * 2 ** (det / 12) / SR) % 1;
            const ph = phases[p] * TAU;
            let s = 0;
            for (let h = 0; h < pad.h.length; h += 1) if (pad.h[h]) s += Math.sin(ph * (h + 1)) * pad.h[h];
            const pan = .5 + (v - 2) * .16 * (det > 0 ? 1 : -1);
            l += s * w * (1 - pan); r += s * w * pan;
            p += 1;
          }
        });
      }
      const g = pad.gain * (.55 + .45 * smooth(t / 6)) * (1 - .35 * breathOf(t)) * (1 - smooth((t - (cue.total - 3.2)) / 3.2)) * (1 + .12 * Math.sin(TAU * t / (BAR * 2)));
      lpL += (l * g - lpL) * pad.lp; lpR += (r * g - lpR) * pad.lp;
      L[i] += lpL; R[i] += lpR;
    }
  }

  if (cue.groove) {
    const on = (t, f = .1) => inRange(t, cue.groove, f) * (1 - breathOf(t, .05));
    if (P.bass === 'sub' || P.bass === 'sine') {
      let ph = 0;
      for (let i = 0; i < n; i += 1) {
        const t = i / SR, g = inRange(t, cue.groove, .8);
        if (g < 1e-3) continue;
        ph = (ph + hz(chordAt(t).root - 12) / SR) % 1;
        const duck = P.bass === 'sub' ? .25 + .75 * smooth((((t - grid) % BEAT) + BEAT) % BEAT / (BEAT * .55)) : 1;
        const s = (Math.sin(TAU * ph) + .25 * Math.sin(2 * TAU * ph)) * (P.bass === 'sub' ? .11 : .075) * g * duck;
        L[i] += s; R[i] += s;
      }
    } else if (P.bass) {
      const tri = (x) => 2 / Math.PI * Math.asin(Math.sin(x));
      let step = 0;
      for (let t = grid; t < cue.total; t += BEAT / 2, step += 1) {
        const g = on(t);
        if (g < .05) continue;
        const c = chordAt(t), m = c.root - 12 + (P.bass === 'triangle' ? [0, 0, 7, 12][step % 4] : step % 2 ? 12 : 0), f = hz(m);
        add(t, BEAT / 2 * .92, (x) => {
          const env = Math.min(1, x / .005) * Math.exp(-x * (P.bass === 'triangle' ? 4 : 6));
          const w = P.bass === 'triangle' ? tri(TAU * f * x) : Math.sin(TAU * f * x) + .35 * Math.sin(2 * TAU * f * x) + .2 * Math.sin(3 * TAU * f * x);
          return w * env * .1 * g;
        });
      }
    }
    for (let t = grid, beat = 0; t < cue.total; t += BEAT, beat += 1) {
      const g = on(t);
      if (g < .05) continue;
      let ph = 0;
      if (P.kick === 'deep') add(t, .32, (x) => { ph += (45 + 95 * Math.exp(-x * 30)) / SR; return Math.sin(TAU * ph) * Math.exp(-x * 11) * .19 * g; });
      if (P.kick === 'felt') add(t, .22, (x) => { ph += (60 + 50 * Math.exp(-x * 40)) / SR; return Math.sin(TAU * ph) * Math.exp(-x * 16) * .12 * g; });
      if (P.kick === 'tight') add(t, .2, (x) => { ph += (50 + 120 * Math.exp(-x * 45)) / SR; return (Math.sin(TAU * ph) * Math.exp(-x * 18) + noise() * Math.exp(-x * 700) * .3) * .2 * g; });
      if (P.kick === 'chip') add(t, .16, (x) => { ph += (60 + 180 * Math.exp(-x * 25)) / SR; return Math.sign(Math.sin(TAU * ph)) * Math.exp(-x * 14) * .07 * g; });
      if (!P.snare || beat % 2 === 0) continue;
      let lp = 0, last = 0;
      if (P.snare === 'snare') add(t, .25, (x) => { const w = noise(); lp += (w - lp) * .35; const bp = lp - last; last = lp; return (bp * Math.exp(-x * 22) * 1.4 + Math.sin(TAU * 190 * x) * Math.exp(-x * 30) * .4) * .08 * g; }, .48);
      if (P.snare === 'clap') add(t, .3, (x) => { const w = noise(); const b = [0, .009, .018].reduce((s, o) => s + (x >= o ? Math.exp(-(x - o) * 60) : 0), 0) * .6 + Math.exp(-x * 18) * .5; return w * b * .07 * g; }, .52);
      if (P.snare === 'noise') add(t, .12, (x) => noise() * Math.exp(-x * 30) * .05 * g, .5);
    }
  }
  if (cue.hats && P.hat) {
    const rate = P.hat === 'shaker' ? 4 : P.hat === 'brush' ? 1 : 2;
    for (let t = grid + BEAT / rate, k = 1; t < cue.total; t += BEAT / rate, k += 1) {
      const on = inRange(t, cue.hats, .1) * (1 - breathOf(t, .05));
      if (on < .05) continue;
      let last = 0, lp = 0;
      if (P.hat === 'hat8') {
        const accent = k % 2 ? 1 : .55;
        add(t, .05, (x) => { const w = noise(), hp = w - last; last = w; return hp * Math.exp(-x * 90) * .022 * on * accent; }, .62);
      } else if (P.hat === 'shaker') {
        const accent = [1, .45, .7, .45][k % 4];
        add(t, .09, (x) => { const w = noise(); lp += (w - lp) * .5; const hp = lp - last; last = lp; return hp * Math.min(1, x / .006) * Math.exp(-x * 40) * .02 * on * accent; }, .6);
      } else {
        add(t, .2, (x) => { const w = noise(); lp += (w - lp) * .08; return lp * Math.sin(Math.PI * x / .2) * .03 * on; }, .58);
      }
    }
  }
  const tone = {
    sine: (f, x) => (Math.sin(TAU * f * x) + .3 * Math.sin(2 * TAU * f * x) * Math.exp(-x * 20)) * Math.exp(-x * 9),
    marimba: (f, x) => (Math.sin(TAU * f * x) + .45 * Math.sin(3.93 * TAU * f * x) * Math.exp(-x * 45)) * Math.exp(-x * 8) * Math.min(1, x / .002),
    pluck: (f, x) => { let s = 0; for (let h = 1; h <= 6; h += 1) s += Math.sin(TAU * f * h * x) * Math.exp(-x * (6 + h * 5)) / h; return s * .8; },
    piano: (f, x) => { let s = 0; const w = [1, .5, .33, .22, .15, .1, .07]; for (let h = 1; h <= 7; h += 1) s += Math.sin(TAU * f * h * 1.0006 ** h * x) * w[h - 1] * Math.exp(-x * (2.2 + h * 1.3)); return s * Math.min(1, x / .003) * .6; },
    square: (f, x) => Math.sign(Math.sin(TAU * f * x)) * Math.exp(-x * 14) * .45,
    glass: (f, x) => (Math.sin(TAU * f * x) + .35 * Math.sin(2.76 * TAU * f * x) * Math.exp(-x * 3)) * Math.exp(-x * 2.5) * Math.min(1, x / .004),
  };
  const toneLen = { sine: .4, marimba: .5, pluck: .45, piano: 1.6, square: .25, glass: 2.2 };
  const toneGain = { sine: .03, marimba: .035, pluck: .032, piano: .03, square: .016, glass: .02 };
  if (cue.arp && P.arp) {
    const dl = Math.round(BEAT * .75 * SR);
    const bL = new Float32Array(n), bR = new Float32Array(n);
    const pattern = [0, 2, 4, 3, 1, 3, 4, 2], fn = tone[P.arp], len = toneLen[P.arp], gain = toneGain[P.arp];
    let step = 0;
    for (let t = grid; t < cue.total; t += BEAT / P.arpRate, step += 1) {
      const on = inRange(t, cue.arp, .8) * (1 - .8 * breathOf(t, .3));
      if (on < .05) continue;
      const f = hz(chordAt(t).tones[pattern[step % 8]] + 12), pan = step % 2 ? .35 : .65, a = Math.floor(t * SR);
      for (let i = 0; i < len * SR && a + i < n; i += 1) {
        const s = fn(f, i / SR) * gain * on;
        bL[a + i] += s * (1 - pan) * 2; bR[a + i] += s * pan * 2;
      }
    }
    for (let i = 0; i < n; i += 1) {
      if (i >= dl) { bL[i] += bR[i - dl] * .38; bR[i] += bL[i - dl] * .38; }
      L[i] += bL[i]; R[i] += bR[i];
    }
  }
  // A repeated sound rotates through three takes (pitch, level, colour), so the ear does not hear a loop.
  const TAKES = [{ v: 0, g: 1, k: 1 }, { v: 2, g: .86, k: 1.12 }, { v: -3, g: .94, k: .9 }];
  toL = FL; toR = FR;
  for (const [j, t] of (cue.ticks ?? []).entries()) {
    let ph = 0;
    const { v, g, k } = TAKES[j % 3];
    if (P.tick === 'bell') add(t, 1.6, (x) => (Math.sin(TAU * hz(76 + v) * x) + .4 * Math.sin(TAU * hz(95 + v) * x) * Math.exp(-x * 6)) * Math.exp(-x * 2.6) * .05 * g);
    if (P.tick === 'glass') add(t, 1.6, (x) => tone.glass(hz(79 + v), x) * .05 * g);
    if (P.tick === 'click') add(t, .05, (x) => (noise() * Math.exp(-x * 900 * k) + Math.sin(TAU * 2200 * k * x) * Math.exp(-x * 120)) * .1 * g);
    if (P.tick === 'piano') add(t, 1.6, (x) => tone.piano(hz(76 + v), x) * .06 * g);
    if (P.tick === 'blip') add(t, .07, (x) => Math.sign(Math.sin(TAU * hz(84 + v) * x)) * (x < .06 ? 1 : 0) * .035 * g);
    if (P.tick === 'tick') add(t, .08, (x) => noise() * (Math.exp(-x * 220 * k) + (x > .035 ? Math.exp(-(x - .035) * 260) * .6 : 0)) * .09 * g);
    if (P.tick === 'pop') add(t, .12, (x) => { ph += (300 * k + 600 * Math.exp(-x * 45)) / SR; return Math.sin(TAU * ph) * Math.exp(-x * 25) * .12 * g; });
  }
  for (const t of cue.impacts ?? []) {
    const tones = chordAt(t + .01).tones;
    let lp = 0, ph = 0, lp2 = 0;
    const riser = (g) => add(t - 1.6, 1.6, (x) => { const w = noise(); lp += (w - lp) * (.01 + .25 * (x / 1.6) ** 2); return lp * (x / 1.6) ** 2 * g; });
    if (P.impact === 'boom') {
      riser(.22);
      add(t, 2.4, (x) => { ph += (30 + 45 * Math.exp(-x * 5)) / SR; return Math.sin(TAU * ph) * Math.exp(-x * 2.2) * .32; });
      add(t, 1.2, (x) => { const w = noise(); lp2 += (w - lp2) * .2; return lp2 * Math.exp(-x * 5) * .16; });
      add(t, 3, (x) => tones.reduce((s, m) => s + Math.sin(TAU * hz(m + 12) * x), 0) * Math.exp(-x * 1.4) * .018);
    } else if (P.impact === 'chord') {
      riser(.1);
      add(t, 3, (x) => tones.reduce((s, m) => s + tone.marimba(hz(m + 12), x), 0) * .03 + Math.sin(TAU * 55 * x) * Math.exp(-x * 3) * .2);
    } else if (P.impact === 'stamp') {
      add(t, .5, (x) => { ph += (50 + 40 * Math.exp(-x * 25)) / SR; return Math.sin(TAU * ph) * Math.exp(-x * 25) * .35 + noise() * Math.exp(-x * 60) * .2; });
      add(t, 1.2, (x) => tones.reduce((s, m) => s + tone.pluck(hz(m), x), 0) * .03);
    } else if (P.impact === 'piano') {
      add(t, 3, (x) => [chordAt(t + .01).root, ...tones].reduce((s, m) => s + tone.piano(hz(m), x), 0) * .045);
    } else if (P.impact === 'chip') {
      add(t, .45, (x) => { ph += (60 + 740 * Math.exp(-x * 9)) / SR; return Math.sign(Math.sin(TAU * ph)) * Math.exp(-x * 6) * .06; });
      add(t, .6, (x) => noise() * Math.exp(-x * 8) * .1);
    } else if (P.impact === 'swell') {
      add(t - 1.6, 1.6, (x) => tones.reduce((s, m) => s + Math.sin(TAU * hz(m) * x), 0) * (x / 1.6) ** 2 * .03);
      add(t, 2.4, (x) => tones.reduce((s, m) => s + tone.glass(hz(m + 12), x), 0) * .025 + Math.sin(TAU * 55 * x) * Math.exp(-x * 2) * .15);
    }
  }
  for (const [j, t] of (cue.whooshes ?? []).entries()) {
    let lp = 0, ph = 0;
    const { g, k } = TAKES[j % 3];
    if (P.whoosh === 'air') add(t - .5, .9, (x) => { const w = noise(), env = Math.sin(Math.PI * x / .9); lp += (w - lp) * (.03 + .2 * k * env); return lp * env * .12 * g; });
    if (P.whoosh === 'slide') add(t - .3, .5, (x) => { const w = noise(), env = Math.sin(Math.PI * x / .5); lp += (w - lp) * (.15 + .3 * k * env); return lp * env * .08 * g; });
    if (P.whoosh === 'paper') add(t - .35, .6, (x) => { const w = noise(), env = Math.sin(Math.PI * x / .6); lp += (w - lp) * .08 * k; return (lp + (rand() < .004 ? noise() * .6 : 0)) * env * .1 * g; });
    if (P.whoosh === 'sweep') add(t - .4, .5, (x) => { ph += (200 * k + 2000 * x) / SR; return Math.sign(Math.sin(TAU * ph)) * Math.sin(Math.PI * x / .5) * .025 * g; });
    if (P.whoosh === 'zip') add(t - .3, .35, (x) => { const w = noise(); lp += (w - lp) * (.02 + 1.4 * k * x); return lp * Math.sin(Math.PI * x / .35) * .12 * g; });
  }
  // Short room on each bus (a linear filter, so the stems still add up to the score), then one scale and a soft clip.
  const room = (A, B) => {
    const combs = [1557, 1617, 1491, 1422].map((d) => ({ d, buf: new Float32Array(d), i: 0 }));
    for (let i = 0; i < n; i += 1) {
      const dry = (A[i] + B[i]) * .5;
      let wet = 0;
      for (const c of combs) { const y = c.buf[c.i]; c.buf[c.i] = dry + y * .72; c.i = (c.i + 1) % c.d; wet += y; }
      A[i] += wet * .05; B[i] += wet * .05;
    }
  };
  room(L, R);
  if (sfxFile) room(FL, FR);
  let peak = 0;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(L[i] + (sfxFile ? FL[i] : 0)), Math.abs(R[i] + (sfxFile ? FR[i] : 0)));
  const norm = .84 / (peak || 1);
  writeWav(file, L, R, norm);
  if (sfxFile) writeWav(sfxFile, FL, FR, norm);
  return { palette: cue.palette ?? 'synth', bpm: 60 / BEAT, mood: cue.mood ?? P.mood ?? 'minor' };
}

function writeWav(file, L, R, norm) {
  const n = L.length, pcm = Buffer.alloc(44 + n * 4);
  pcm.write('RIFF', 0); pcm.writeUInt32LE(36 + n * 4, 4); pcm.write('WAVE', 8); pcm.write('fmt ', 12);
  pcm.writeUInt32LE(16, 16); pcm.writeUInt16LE(1, 20); pcm.writeUInt16LE(2, 22); pcm.writeUInt32LE(SR, 24);
  pcm.writeUInt32LE(SR * 4, 28); pcm.writeUInt16LE(4, 32); pcm.writeUInt16LE(16, 34); pcm.write('data', 36); pcm.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i += 1) {
    pcm.writeInt16LE(Math.round(Math.tanh(L[i] * norm * 1.1) * 32000), 44 + i * 4);
    pcm.writeInt16LE(Math.round(Math.tanh(R[i] * norm * 1.1) * 32000), 46 + i * 4);
  }
  writeFileSync(file, pcm);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const timeline = readJson(arg('timeline', 'timeline.json'));
  const cues = resolveCues(readJson(arg('cues', 'cues.json')), timeline);
  if (typeof arg('palette') === 'string') cues.palette = arg('palette');
  const lost = ['impacts', 'whooshes', 'ticks'].flatMap((k) => (cues[k] ?? []).filter((t) => t < 0 || t > cues.total).map((t) => `${k} ${t.toFixed(2)}`));
  if (lost.length) console.warn(`warning: outside the ${cues.total.toFixed(1)} s film, so never heard: ${lost.join(', ')}`);
  const out = arg('out', 'score.wav'), sfx = typeof arg('sfx') === 'string' ? arg('sfx') : null;
  const info = writeScore(out, cues, sfx);
  console.log(`wrote ${out}${sfx ? ` (bed) and ${sfx} (hits)` : ''} (${cues.total.toFixed(1)} s, palette ${info.palette}, ${info.bpm.toFixed(0)} bpm, ${info.mood})`);
}
