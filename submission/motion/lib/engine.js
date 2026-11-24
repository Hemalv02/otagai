// Stage engine. Exposes window.seek(filmTime) which paints that exact frame, deterministically.
// Configuration lives in scenes/index.js (scenes, DURATION, BG, WARP, FONTS) — this file is generic.
import { hex, rgb, mixc, seg, easeInOut } from './motion.js';
import * as cfg from '../scenes/index.js';
import { drawHero } from './hero.js';

const scenes = cfg.scenes;
const BG = cfg.BG || [[0, '#000000']];
const WARP = cfg.WARP || null; // [[filmTime, storyTime], ...] piecewise-linear; null = identity
const FONTS = cfg.FONTS || [];

const root = document.getElementById('scenes');
const bg = document.getElementById('bg');
const grain = document.getElementById('grain');
const vignette = document.getElementById('vignette');
const gctx = grain.getContext('2d');
const gimg = gctx.createImageData(grain.width, grain.height);

// Background colour keys: [storyTime, '#hex', blendSeconds]
function bgAt(t) {
  let c = hex(BG[0][1]);
  for (let i = 1; i < BG.length; i++) {
    const [ti, col, d = 0.6] = BG[i];
    c = mixc(c, hex(col), easeInOut(seg(t, ti, ti + Math.max(d, 0.001))));
  }
  return c;
}

// Film time → story time (lets you author a long cut and play parts of it faster).
export function warp(f) {
  if (!WARP) return f;
  for (let i = 1; i < WARP.length; i++) {
    const [f0, s0] = WARP[i - 1], [f1, s1] = WARP[i];
    if (f <= f1 || i === WARP.length - 1) return s0 + ((f - f0) * (s1 - s0)) / (f1 - f0);
  }
}
export function unwarp(s) {
  if (!WARP) return s;
  for (let i = 1; i < WARP.length; i++) {
    const [f0, s0] = WARP[i - 1], [f1, s1] = WARP[i];
    if (s <= s1 || i === WARP.length - 1) return f0 + ((s - s0) * (f1 - f0)) / (s1 - s0);
  }
}

// Per-frame context scenes may write to.
const ctx = { heroXform: null, grainAmt: 0.08, vig: 1 };
for (const s of scenes) {
  s.el = document.createElement('div');
  s.el.className = 'scene';
  s.el.id = s.id;
  root.appendChild(s.el);
  s.build(s.el, ctx);
}

function paintGrain(frame) {
  const d = gimg.data;
  let x = (frame * 2654435761) >>> 0 || 1;
  for (let i = 0; i < d.length; i += 4) {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5; x >>>= 0;
    d[i] = d[i + 1] = d[i + 2] = x & 255;
    d[i + 3] = 255;
  }
  gctx.putImageData(gimg, 0, 0);
}

window.seek = (film) => {
  const t = warp(film);
  ctx.heroXform = null;
  ctx.grainAmt = cfg.GRAIN ?? 0.08;
  ctx.vig = 1;
  bg.style.background = rgb(bgAt(t));
  document.documentElement.style.setProperty('--bgc', rgb(bgAt(t)));
  for (const s of scenes) {
    const on = t >= s.start - (s.pre || 0) && t < s.end + (s.post || 0);
    s.el.style.display = on ? 'block' : 'none';
    if (on) s.update(t - s.start, t, ctx);
  }
  drawHero(t, ctx);
  grain.style.opacity = ctx.grainAmt;
  vignette.style.opacity = ctx.vig;
  paintGrain(Math.round(film * 30));
};
window.DURATION = cfg.DURATION;
window.warp = warp;
window.unwarp = unwarp;
// Preload every face explicitly: hidden scenes don't trigger font loads, and layout measured
// before a font arrives is wrong (boxes drawn around text end up offset).
window.ready = Promise.all(FONTS.map(([spec, sample]) => document.fonts.load(spec, sample || 'Aa')))
  .then(() => document.fonts.ready)
  .then(() => { window.seek(0); return true; });
