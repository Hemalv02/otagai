// Deterministic motion primitives. Everything is a pure function of time,
// so seek(t) can paint any frame without simulating the frames before it.

export const BPM = 96;
export const BEAT = 60 / BPM;      // 0.625s
export const BAR = BEAT * 4;       // 2.5s
export const bar = (n) => n * BAR;
export const beat = (n) => n * BEAT;

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, p) => a + (b - a) * p;
export const seg = (t, a, b) => clamp((t - a) / (b - a));
export const smooth = (p) => p * p * (3 - 2 * p);
export const easeOut = (p) => 1 - Math.pow(1 - clamp(p), 3);
export const easeIn = (p) => Math.pow(clamp(p), 3);
export const easeInOut = (p) => (p = clamp(p), p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const expoOut = (p) => (p = clamp(p), p === 1 ? 1 : 1 - Math.pow(2, -10 * p));

// Closed-form damped spring from 0 → 1. `period` ≈ natural oscillation period (s), `zeta` damping ratio.
export const PRESETS = {
  snappy:  { period: 0.42, zeta: 0.72 },  // chips, buttons, leading edges
  default: { period: 0.70, zeta: 0.86 },  // cards, containers, camera
  heavy:   { period: 1.05, zeta: 1.0 },   // big type, phone, logo — no overshoot
  playful: { period: 0.62, zeta: 0.48 },  // the ring, stickers — visible overshoot
  soft:    { period: 1.60, zeta: 1.0 },   // slow drifts, backgrounds
};

export function spring(t, preset = 'default') {
  if (t <= 0) return 0;
  const { period, zeta } = typeof preset === 'string' ? PRESETS[preset] : preset;
  const w = (2 * Math.PI) / period;
  if (zeta >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}

// A value that changes target several times. One spring per change, never restarted:
// track(t, [[0, 10], [1.2, 40, 'snappy'], [3, 0]])
export function track(t, keys, defPreset = 'default') {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [ti, vi, preset] = keys[i];
    const prev = keys[i - 1][1];
    const p = spring(t - ti, preset || defPreset);
    if (Array.isArray(vi)) v = v.map((x, k) => x + (vi[k] - prev[k]) * p);
    else v += (vi - prev) * p;
  }
  return v;
}

// Step-like eased track (no overshoot, fixed duration) — for timed choreography.
export function tween(t, keys, ease = easeInOut) {
  let v = keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [ti, vi, dur = 0.6, fn] = keys[i];
    const prev = keys[i - 1][1];
    v += (vi - prev) * (fn || ease)(seg(t, ti, ti + dur));
  }
  return v;
}

// Deterministic hash noise.
export function rand(i, salt = 0) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
export const rrange = (i, a, b, salt = 0) => lerp(a, b, rand(i, salt));

// Smooth 1D value noise for gentle drift.
export function noise1(x, salt = 0) {
  const i = Math.floor(x), f = x - i;
  return lerp(rand(i, salt), rand(i + 1, salt), smooth(f)) * 2 - 1;
}

// Colour helpers
export function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
export const mixc = (a, b, p) => [lerp(a[0], b[0], p), lerp(a[1], b[1], p), lerp(a[2], b[2], p)];

// Apply a transform/opacity bag to an element.
export function css(el, o) {
  if (!el) return;
  const tf = [];
  if (o.x != null || o.y != null) tf.push(`translate3d(${(o.x || 0).toFixed(2)}px,${(o.y || 0).toFixed(2)}px,0)`);
  if (o.r != null) tf.push(`rotate(${o.r.toFixed(3)}deg)`);
  if (o.rx != null) tf.push(`rotateX(${o.rx.toFixed(3)}deg)`);
  if (o.ry != null) tf.push(`rotateY(${o.ry.toFixed(3)}deg)`);
  if (o.s != null) tf.push(`scale(${o.s.toFixed(4)})`);
  if (o.sx != null || o.sy != null) tf.push(`scale(${(o.sx ?? 1).toFixed(4)},${(o.sy ?? 1).toFixed(4)})`);
  if (tf.length) el.style.transform = tf.join(' ');
  if (o.o != null) el.style.opacity = clamp(o.o).toFixed(3);
  if (o.blur != null) el.style.filter = o.blur > 0.05 ? `blur(${o.blur.toFixed(2)}px)` : 'none';
  if (o.clip != null) el.style.clipPath = o.clip;
  if (o.w != null) el.style.width = `${o.w.toFixed(2)}px`;
  if (o.h != null) el.style.height = `${o.h.toFixed(2)}px`;
  if (o.bg != null) el.style.background = o.bg;
  if (o.color != null) el.style.color = o.color;
  if (o.vis != null) el.style.visibility = o.vis ? 'visible' : 'hidden';
}

export function h(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

// Reveal helpers for kinetic type: wraps each word in a mask so it can wipe up from below.
export function words(text, cls = '') {
  return text
    .split(' ')
    .map((w) => `<span class="w ${cls}"><span class="wi">${w}</span></span>`)
    .join(' ');
}

// Animate a .w/.wi word set: words rise through their mask with a per-word stagger.
export function riseWords(el, t, t0, { stagger = 0.06, preset = 'heavy', dist = 1.1, out = null } = {}) {
  const ws = el.querySelectorAll('.wi');
  ws.forEach((w, i) => {
    const p = spring(t - t0 - i * stagger, preset);
    let y = (1 - p) * dist * 100;
    let o = clamp(p * 1.5);
    if (out != null) {
      const q = easeIn(seg(t, out + i * 0.025, out + 0.35 + i * 0.025));
      y -= q * dist * 100;
      o *= 1 - q;
    }
    w.style.transform = `translateY(${y.toFixed(2)}%)`;
    w.style.opacity = o.toFixed(3);
  });
}
