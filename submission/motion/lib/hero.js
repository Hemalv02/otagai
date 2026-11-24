// The HERO: one closed contour that never cuts. It morphs between shapes
// (circle → logo → button → reticle → data point → …) and carries the film's continuity.
// Its whole life is declared in scenes/heroplan.js (export HERO, or HERO = null to disable).
import { track, tween, seg, clamp, hex, rgb, mixc, easeInOut } from './motion.js';
import { HERO } from '../scenes/heroplan.js';
import { ICONS } from './ui.js';

const N = 240; // points per contour — every shape is resampled to N points by arc length
const NS = 'http://www.w3.org/2000/svg';
const svg = document.getElementById('hero');
const sampler = document.createElementNS(NS, 'path');
const cache = new Map();

// Shapes are centred on (0,0) and must START AT TOP-CENTRE and run CLOCKWISE,
// so that point i of one shape corresponds to point i of the next (clean morphs, no twisting).
export function shapeD(desc) {
  const [kind, a, b, c] = desc;
  if (kind === 'circle') return `M0 ${-a}A${a} ${a} 0 1 1 0 ${a}A${a} ${a} 0 1 1 0 ${-a}Z`;
  if (kind === 'rrect') {
    const w = a / 2, hh = b / 2, r = Math.min(c ?? 0, w, hh);
    return `M0 ${-hh}H${w - r}A${r} ${r} 0 0 1 ${w} ${-hh + r}V${hh - r}A${r} ${r} 0 0 1 ${w - r} ${hh}H${-w + r}A${r} ${r} 0 0 1 ${-w} ${hh - r}V${-hh + r}A${r} ${r} 0 0 1 ${-w + r} ${-hh}Z`;
  }
  if (kind === 'heart') {
    const s = a; // half-width
    const p = (x, y) => `${(x * s).toFixed(2)} ${(y * s).toFixed(2)}`;
    return `M${p(0, -0.46)}C${p(0.2, -0.84)} ${p(0.94, -0.98)} ${p(1, -0.32)}C${p(1.03, 0.14)} ${p(0.58, 0.5)} ${p(0.12, 0.86)}C${p(0.06, 0.92)} ${p(-0.06, 0.92)} ${p(-0.12, 0.86)}C${p(-0.58, 0.5)} ${p(-1.03, 0.14)} ${p(-1, -0.32)}C${p(-0.94, -0.98)} ${p(-0.2, -0.84)} ${p(0, -0.46)}Z`;
  }
  if (kind === 'polygon') {
    // ['polygon', radius, sides, cornerRadiusIgnored] — regular polygon, vertex at top
    const n = b || 6, pts = [];
    for (let i = 0; i <= n; i++) {
      const ang = -Math.PI / 2 + (i * 2 * Math.PI) / n;
      pts.push(`${(Math.cos(ang) * a).toFixed(2)} ${(Math.sin(ang) * a).toFixed(2)}`);
    }
    return `M${pts.join('L')}Z`;
  }
  if (kind === 'path') return a; // your own closed path string (centred, top-centre start, clockwise)
  throw new Error('unknown hero shape ' + kind);
}

function sample(desc) {
  const key = JSON.stringify(desc);
  if (cache.has(key)) return cache.get(key);
  svg.appendChild(sampler);
  sampler.setAttribute('d', shapeD(desc));
  const L = sampler.getTotalLength();
  const pts = [];
  for (let i = 0; i < N; i++) {
    const q = sampler.getPointAtLength((i / N) * L);
    pts.push(q.x, q.y);
  }
  sampler.remove();
  cache.set(key, pts);
  return pts;
}

// Corner-bracket dash pattern for an rrect (scanner reticle), blended with a solid stroke by b∈[0,1].
// Never emits zero-length dashes: with round caps those render as stray dots.
function bracketDash(desc, b, arm) {
  const [, w, h, r] = desc;
  const A = (Math.PI * r) / 2, a = w / 2 - r, V = h - 2 * r, H = w - 2 * r, D = arm + A + arm;
  const gaps = [V - 2 * arm, H - 2 * arm, V - 2 * arm, 2 * (a - arm)];
  const out = [];
  for (const gp of gaps) out.push(D + (1 - b) * gp, Math.max(0.001, b * gp));
  return [out.map((v) => v.toFixed(2)).join(' '), (-(a - arm)).toFixed(2)];
}

const g = document.createElementNS(NS, 'g');
const trackPath = document.createElementNS(NS, 'path');
const glowPath = document.createElementNS(NS, 'path');
const mainPath = document.createElementNS(NS, 'path');
for (const p of [trackPath, glowPath, mainPath]) {
  p.setAttribute('fill', 'none');
  p.setAttribute('stroke-linecap', 'round');
  p.setAttribute('stroke-linejoin', 'round');
  g.appendChild(p);
}
glowPath.style.filter = 'blur(18px)';
const glyphs = document.createElementNS(NS, 'g');
g.appendChild(glyphs);
svg.appendChild(g);
let lastGlyphKey = '';

export function colorAt(t, keys) {
  let c = hex(keys[0][1]);
  for (let i = 1; i < keys.length; i++) {
    const [ti, col, d = 0.5] = keys[i];
    c = mixc(c, hex(col), easeInOut(seg(t, ti, ti + d)));
  }
  return c;
}

const one = () => 1, zero = () => 0;

export function drawHero(t, ctx) {
  if (!HERO) { svg.style.display = 'none'; return; }
  const H = HERO;
  const keys = H.shape.map(([ti, desc, preset]) => [ti, sample(desc), preset]);
  const pts = track(t, keys, 'playful');
  const [x, y] = track(t, H.pos, 'default');
  const sc = (H.scale || one)(t);
  const op = (H.opacity || one)(t);
  const sw = track(t, H.stroke || [[0, 6]], 'default');
  const fill = clamp(tween(t, H.fill || [[0, 0]]));
  const col = colorAt(t, H.color);
  const fillCol = colorAt(t, H.fillColor || H.color);
  const prog = (H.progress || one)(t);
  const brk = H.brackets ? H.brackets(t) : null;
  const glow = (H.glow || zero)(t);

  let d = '';
  for (let i = 0; i < N; i++) d += (i ? 'L' : 'M') + pts[2 * i].toFixed(2) + ' ' + pts[2 * i + 1].toFixed(2);
  d += 'Z';
  for (const p of [trackPath, glowPath, mainPath]) p.setAttribute('d', d);
  let L = 0;
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    L += Math.hypot(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1]);
  }

  const swS = (sw / Math.max(sc, 0.001)).toFixed(2); // constant on-screen stroke width while scaling
  mainPath.setAttribute('stroke', rgb(col));
  mainPath.setAttribute('stroke-width', swS);
  mainPath.setAttribute('fill', rgb(fillCol, fill));
  if (brk && brk.amount > 0.001) {
    const [da, off] = bracketDash(brk.desc, brk.amount, brk.arm || 60);
    mainPath.setAttribute('stroke-dasharray', da);
    mainPath.setAttribute('stroke-dashoffset', off);
  } else {
    mainPath.removeAttribute('stroke-dashoffset');
    if (prog < 0.9995) mainPath.setAttribute('stroke-dasharray', `${(L * prog).toFixed(2)} ${(L + 10).toFixed(2)}`);
    else mainPath.removeAttribute('stroke-dasharray');
  }

  // Faint full-length "track" under a progress arc (clock / countdown look).
  trackPath.setAttribute('stroke', rgb(H.trackColor ? colorAt(t, H.trackColor) : col, H.trackAlpha ? H.trackAlpha(t) : 0));
  trackPath.setAttribute('stroke-width', swS);

  glowPath.setAttribute('stroke', rgb(colorAt(t, H.glowColor || H.color)));
  glowPath.setAttribute('stroke-width', ((sw * 2.4) / Math.max(sc, 0.001)).toFixed(2));
  glowPath.style.opacity = glow.toFixed(3);
  if (prog < 0.9995) glowPath.setAttribute('stroke-dasharray', `${(L * prog).toFixed(2)} ${(L + 10).toFixed(2)}`);
  else glowPath.removeAttribute('stroke-dasharray');

  let tx = x, ty = y, s = sc;
  if (ctx.heroXform) {
    const { x: ox = 0, y: oy = 0, s: os = 1, cx = 960, cy = 540 } = ctx.heroXform;
    tx = cx + (x - cx) * os + ox;
    ty = cy + (y - cy) * os + oy;
    s *= os;
  }

  // Glyphs ride on the hero (icons, labels, inner discs) — scenes are UNDER the hero layer,
  // so anything that must appear on top of the hero has to be a glyph.
  const gl = (H.glyph ? H.glyph(t) : []).filter((q) => q.o > 0.001);
  const key = gl.map((q) => [q.kind, q.name || q.text, q.size, q.color, q.weight, q.font, q.r].join(',')).join('|');
  if (key !== lastGlyphKey) {
    glyphs.innerHTML = gl
      .map((q) =>
        q.kind === 'circle'
          ? `<circle cx="0" cy="0" r="${q.size}" fill="${q.color}"/>`
          : q.kind === 'rect'
          ? `<rect x="${-q.size / 2}" y="${-q.size / 2}" width="${q.size}" height="${q.size}" rx="${q.r || 0}" fill="${q.color}"/>`
          : q.kind === 'icon'
          ? `<g transform="translate(${-q.size / 2} ${-q.size / 2}) scale(${q.size / 24})" fill="none" stroke="${q.color}" stroke-width="${q.sw || 2.4}" stroke-linecap="round" stroke-linejoin="round">${ICONS[q.name]}</g>`
          : `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${q.color}" style="font:${q.weight || 700} ${q.size}px var(--${q.font || 'sans'});letter-spacing:-0.01em">${q.text}</text>`
      )
      .join('');
    lastGlyphKey = key;
  }
  [...glyphs.children].forEach((c, i) => (c.style.opacity = gl[i].o.toFixed(3)));

  g.setAttribute('transform', `translate(${tx.toFixed(2)} ${ty.toFixed(2)}) scale(${s.toFixed(4)})`);
  g.style.opacity = op.toFixed(3);
  ctx.hero = { x: tx, y: ty, s };
}
