import { clamp, lerp, seg, easeInOut, easeOut, expoOut, spring, track, rand, noise1 } from '../lib/motion.js';

export const S = 24;
const V = [[184, 131], [160, 106], [77, 158], [77, 249], [179, 249], [179, 182], [284, 116], [284, 249], [212, 249]];
const R = [0, 9, 14, 11, 11, 10, 22, 11, 0];
const STEP = 0.5;

function buildPath() {
  const out = [];
  const push = (p) => out.push(p);
  push(V[0]);
  for (let i = 1; i < V.length; i++) {
    const p = V[i];
    if (i === V.length - 1) { push(p); break; }
    const a = V[i - 1], b = V[i + 1];
    const lin = Math.hypot(p[0] - a[0], p[1] - a[1]), lout = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const r = Math.min(R[i], lin / 2, lout / 2);
    const p0 = [p[0] + ((a[0] - p[0]) / lin) * r, p[1] + ((a[1] - p[1]) / lin) * r];
    const p1 = [p[0] + ((b[0] - p[0]) / lout) * r, p[1] + ((b[1] - p[1]) / lout) * r];
    push(p0);
    for (let k = 1; k <= 18; k++) {
      const s = k / 18, m = 1 - s;
      push([m * m * p0[0] + 2 * m * s * p[0] + s * s * p1[0], m * m * p0[1] + 2 * m * s * p[1] + s * s * p1[1]]);
    }
  }
  const pts = [out[0]];
  const L = [0];
  let acc = 0, carry = 0;
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i];
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let s = STEP - carry;
    while (s <= d) {
      const q = s / d;
      pts.push([a[0] + (b[0] - a[0]) * q, a[1] + (b[1] - a[1]) * q]);
      L.push(acc + s);
      s += STEP;
    }
    carry = d - (s - STEP);
    acc += d;
  }
  pts.push(out[out.length - 1]);
  L.push(acc);
  return { pts, L, total: acc };
}

export const PATH = buildPath();
const NOM = [0, 34.7, 132.6, 223.6, 325.6, 392.6, 516.6, 649.6, 721.6];
const REAL = [0, 33, 129, 217, 314, 379, 495, 619, PATH.total];
const pw = (x, A, B) => {
  if (x <= A[0]) return B[0];
  for (let i = 1; i < A.length; i++) if (x <= A[i]) return B[i - 1] + ((x - A[i - 1]) * (B[i] - B[i - 1])) / (A[i] - A[i - 1]);
  return B[B.length - 1];
};
const toReal = (u) => pw(u, NOM, REAL);
const toNom = (r) => pw(r, REAL, NOM);
export const TOTAL = NOM[NOM.length - 1];
const PS = PATH.pts.map(([x, y]) => `L${x.toFixed(2)} ${y.toFixed(2)}`);

function idxAt(u) {
  const L = PATH.L;
  let lo = 0, hi = L.length - 1;
  u = toReal(clamp(u, 0, TOTAL));
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (L[m] <= u) lo = m; else hi = m; }
  return [lo, hi, L[hi] > L[lo] ? (u - L[lo]) / (L[hi] - L[lo]) : 0];
}
export function P(u) {
  const [a, b, q] = idxAt(u);
  const A = PATH.pts[a], B = PATH.pts[b];
  return [A[0] + (B[0] - A[0]) * q, A[1] + (B[1] - A[1]) * q];
}
export function tangent(u) {
  const a = P(u - 0.6), b = P(u + 0.6);
  const d = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
  return [(b[0] - a[0]) / d, (b[1] - a[1]) / d];
}
export function partialD(u0, u1) {
  if (u1 - u0 < 0.05) return '';
  const [a0, b0] = idxAt(u0);
  const [a1] = idxAt(u1);
  const s = P(u0), e = P(u1);
  return `M${s[0].toFixed(2)} ${s[1].toFixed(2)}` + PS.slice(b0, a1 + 1).join('') + `L${e[0].toFixed(2)} ${e[1].toFixed(2)}`;
}
export function nearestU(x, y) {
  let best = 1e9, bu = 0;
  for (let i = 0; i < PATH.pts.length; i += 2) {
    const [px, py] = PATH.pts[i];
    const d = (px - x) ** 2 + (py - y) ** 2;
    if (d < best) { best = d; bu = PATH.L[i]; }
  }
  return [toNom(bu), Math.sqrt(best)];
}

function mono(knots) {
  const n = knots.length, xs = knots.map((k) => k[0]), ys = knots.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (d[i - 1] + d[i])) / ((2 * d[i] + d[i - 1]) / d[i - 1] + (d[i] + 2 * d[i - 1]) / d[i]);
  m[0] = 0; m[n - 1] = 0;
  return (t) => {
    if (t <= xs[0]) return ys[0];
    if (t >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (t > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i], s = (t - xs[i]) / h;
    const h00 = 2 * s ** 3 - 3 * s ** 2 + 1, h10 = s ** 3 - 2 * s ** 2 + s, h01 = -2 * s ** 3 + 3 * s ** 2, h11 = s ** 3 - s ** 2;
    return h00 * ys[i] + h10 * h * m[i] + h01 * ys[i + 1] + h11 * h * m[i + 1];
  };
}

export const U = { peak: 31, eave: 128, wallEnd: 218, floorEnd: 324, junction: 392, rahim: 440, rpeak: 545, rwallEnd: 652, end: TOTAL };

export const penU = mono([
  [0, 0], [1.2, 0], [6.8, 33], [14.6, 116], [19.6, 125], [27.4, 214], [29.2, 262], [30.8, 326],
  [35.4, 330], [44.6, 386], [45.7, U.junction], [61.0, U.junction], [62.6, U.rahim], [70.0, U.rahim + 3],
  [72.4, 512], [75.0, 538], [77.0, 560], [83.0, 566], [93.0, 646], [95.6, 654], [103.4, 708], [106.0, 714], [111.0, TOTAL], [120, TOTAL],
]);
const camU = mono([
  [0, 0], [1.2, 0], [6.8, 33], [14.6, 116], [19.6, 125], [27.4, 214], [29.2, 262], [30.8, 326],
  [35.4, 330], [44.6, 386], [45.7, U.junction], [61.0, U.junction], [62.6, 416], [70.0, 418],
  [72.4, 512], [75.0, 538], [77.0, 560], [83.0, 566], [93.0, 646], [95.6, 654], [103.4, 708], [106.0, 714], [111.0, TOTAL], [120, TOTAL],
]);
const FRAME = [
  [0, [960, 540]],
  [2.0, [1210, 360], 'soft'],
  [7.0, [1250, 250], 'soft'],
  [14.6, [1180, 400], 'soft'],
  [19.6, [960, 300], 'soft'],
  [27.0, [640, 640], 'soft'],
  [29.0, [1250, 640], 'soft'],
  [33.8, [1130, 560], 'soft'],
  [46.4, [860, 600], 'soft'],
  [60.6, [960, 560], 'soft'],
  [70.4, [1380, 420], 'soft'],
  [83.0, [1560, 560], 'soft'],
  [88.4, [1560, 860], 'soft'],
  [95.4, [1260, 520], 'soft'],
  [104.8, [1400, 720], 'soft'],
];
const ZOOM = [
  [0, 2.1], [1.6, 1.0, 'soft'], [19.8, 0.62, 'soft'], [27.6, 0.86, 'soft'], [33.4, 0.95, 'soft'],
  [46.2, 0.56, 'soft'], [60.4, 0.74, 'soft'], [70.4, 0.9, 'soft'], [95.0, 0.86, 'soft'], [104.8, 0.95, 'soft'],
];
export const T_PULL = 112.6;
const T_PULL_END = 117.6;
export const LOCK = { mx: 180, my: 180, sx: 640, sy: 540, size: 560 };

export function camera(t) {
  const uc = camU(t);
  const p = P(uc);
  const f = track(t, FRAME, 'soft');
  let z = track(t, ZOOM, 'soft');
  const dx = noise1(t * 0.22, 3) * 6, dy = noise1(t * 0.19, 9) * 5;
  let cx = p[0] - (f[0] - 960 + dx) / (z * S);
  let cy = p[1] - (f[1] - 540 + dy) / (z * S);
  const q = easeInOut(seg(t, T_PULL, T_PULL_END));
  if (q > 0) {
    const zf = LOCK.size / 360 / S;
    const zl = Math.exp(lerp(Math.log(z), Math.log(zf), q));
    const tx = LOCK.mx - (LOCK.sx - 960) / (zf * S), ty = LOCK.my - (LOCK.sy - 540) / (zf * S);
    const w = (1 / zl - 1 / z) / (1 / zf - 1 / z || 1);
    cx = lerp(cx, tx, clamp(w)); cy = lerp(cy, ty, clamp(w));
    z = zl;
  }
  return { cx, cy, z, k: z * S };
}

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}, parent) => {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.appendChild(e);
  return e;
};

const RIPPLE_C = () => P(U.junction);
export const RINGS = [
  { r: 12, t: 48.2, label: 'Family' },
  { r: 24, t: 50.7, label: 'Your circle' },
  { r: 38, t: 53.2, label: 'Association' },
  { r: 56, t: 55.7, label: 'Nearby within 3 km' },
];
export const ringR = (j, t) => RINGS[j].r * expoOut(seg(t, RINGS[j].t, RINGS[j].t + 1.8));

const RESERVED = [
  [150, 95, 200, 140],
  [205, 212, 290, 275],
  [92, 222, 190, 268],
];

function houseShape(w, h) {
  const rh = w * 0.42;
  return `M${-w / 2} 0V${-h}L0 ${-h - rh}L${w / 2} ${-h}V0Z`;
}

export const SPECIAL = {
  enryoNbr: [55, 132],
  rahim: [228, 172],
  ammu: [226, 247],
};

export default {
  id: 'world',
  start: 0,
  end: 121,
  build(root) {
    root.innerHTML = `<svg class="wsvg" width="1920" height="1080" viewBox="0 0 1920 1080">
      <g class="far"></g><g class="cam"></g></svg><div class="abs wl" style="inset:0"></div>`;
    const svg = root.querySelector('svg');
    this.far = svg.querySelector('.far');
    this.cam = svg.querySelector('.cam');

    for (let i = 0; i < 26; i++) {
      const y0 = 30 + i * 12;
      let d = '';
      for (let x = -200; x <= 560; x += 8) {
        const y = y0 + noise1(x * 0.012 + i * 3.1, 5) * 9 + noise1(x * 0.04 + i, 2) * 2.5;
        d += (x === -200 ? 'M' : 'L') + x + ' ' + y.toFixed(2);
      }
      el('path', { d, fill: 'none', stroke: '#E4DFD2', 'stroke-width': 1.4 }, this.far);
    }

    this.iconBg = el('rect', { x: 0, y: 0, width: 360, height: 360, rx: 80, fill: '#537257', opacity: 0 }, this.cam);
    this.deco = el('g', {}, this.cam);

    this.stairs = el('g', { stroke: '#C9CDC1', 'stroke-width': 1.6, fill: 'none' }, this.deco);
    {
      const a = P(U.peak + 6), b = P(U.eave - 10);
      const n = 22;
      for (let i = 0; i <= n; i++) {
        const q = i / n;
        const x = lerp(a[0], b[0], q), y = lerp(a[1], b[1], q);
        el('path', { d: `M${x} ${y + 1.4}l-3.2 0l0 2.1`, opacity: 1 }, this.stairs);
      }
      el('path', { d: `M${a[0]} ${a[1] + 4.9}L${b[0]} ${b[1] + 4.9}` }, this.stairs);
    }

    this.waves = el('g', { stroke: '#C9D3C6', 'stroke-width': 1.5, fill: 'none' }, this.deco);
    for (let r = 0; r < 5; r++) {
      let d = '';
      for (let x = 200; x <= 300; x += 1) {
        const y = 253 + r * 3.2 + Math.sin(x * 0.9 + r * 1.7) * 0.55;
        d += (x === 200 ? 'M' : 'L') + x + ' ' + y.toFixed(2);
      }
      el('path', { d, opacity: 1 - r * 0.16 }, this.waves);
    }

    this.houses = [];
    const hg = el('g', {}, this.deco);
    const add = (x, y, w, h, opts = {}) => {
      const g = el('g', { transform: `translate(${x} ${y})` }, hg);
      el('path', { d: houseShape(w, h), fill: '#FBF9F3', stroke: '#C6CBBE', 'stroke-width': 1.6, 'stroke-linejoin': 'round' }, g);
      const ws = [];
      const nw = w > 6 ? 2 : 1;
      for (let i = 0; i < nw; i++) {
        const wx = nw === 1 ? -w * 0.18 : -w * 0.3 + i * w * 0.32;
        ws.push(el('rect', { x: wx - 0.6, y: -h * 0.72, width: 1.2, height: 1.2, rx: 0.15, fill: '#EFEBE0', stroke: '#CFD3C7', 'stroke-width': 1.2 }, g));
      }
      const door = el('rect', { x: w * 0.12, y: -1.9, width: 1.05, height: 1.9, rx: 0.12, fill: '#EFEBE0', stroke: '#CFD3C7', 'stroke-width': 1.2 }, g);
      const dot = el('circle', { cx: 0, cy: -h - w * 0.42 - 1.6, r: 0.62, fill: '#537257', opacity: 0 }, g);
      const hs = { x, y, w, h, g, ws, door, dot, lit: Infinity, del: Infinity, stub: null, ...opts };
      this.houses.push(hs);
      return hs;
    };

    let id = 0;
    for (let gy = 40; gy <= 330; gy += 12.5) {
      for (let gx = -80; gx <= 440; gx += 12.5) {
        id++;
        const x = gx + rrand(id, 1) * 7 - 3.5, y = gy + rrand(id, 2) * 6 - 3;
        const w = 4.6 + rrand(id, 3) * 3.2, h = 3.4 + rrand(id, 4) * 2.2;
        const [, dist] = nearestU(x, y - h / 2);
        if (dist < 6.5 + w * 0.5) continue;
        if (RESERVED.some(([a, b, c, d]) => x > a && x < c && y > b && y < d)) continue;
        if (Math.hypot(x - SPECIAL.enryoNbr[0], y - SPECIAL.enryoNbr[1]) < 10) continue;
        if (Math.hypot(x - SPECIAL.rahim[0], y - SPECIAL.rahim[1]) < 10) continue;
        add(x, y, w, h);
      }
    }
    this.enryoNbr = add(SPECIAL.enryoNbr[0], SPECIAL.enryoNbr[1], 6.4, 4.6, { special: 'enryo' });
    this.rahimHouse = add(SPECIAL.rahim[0], SPECIAL.rahim[1], 6.6, 4.8, { special: 'rahim' });

    const W0 = P(170);
    for (const hs of this.houses) {
      const d = Math.hypot(hs.x - W0[0], hs.y - W0[1]);
      if (d < 62) hs.lit = 20.4 + d * 0.075 + rrand(hs.x * 7 + hs.y, 8) * 0.5;
      const c = RIPPLE_C();
      const dr = Math.hypot(hs.x - c[0], hs.y - hs.h - c[1]);
      for (let j = 0; j < RINGS.length; j++) {
        if (dr <= RINGS[j].r && (j === 0 || dr > RINGS[j - 1].r)) {
          const p = clamp(dr / RINGS[j].r);
          const q = Math.log(1 - Math.min(0.999, p * 0.999)) / -10;
          hs.del = RINGS[j].t + q * 1.8;
          hs.ring = j;
        }
      }
    }
    this.houses.filter((h) => h.lit < 40 && !h.special).forEach((hs, i) => {
      if (i % 2) return;
      const [nu] = nearestU(hs.x + hs.w * 0.12, hs.y - 1);
      const tp = P(nu);
      const sx = hs.x + hs.w * 0.12 + 0.5, sy = hs.y;
      const len = Math.hypot(tp[0] - sx, tp[1] - sy);
      if (len > 40) return;
      hs.stub = el('path', { d: '', fill: 'none', stroke: '#537257', 'stroke-width': 2, 'stroke-linecap': 'round' }, hg);
      hs.stubA = [sx, sy];
      hs.stubB = tp;
      hs.stubLen = len;
      hs.stubDelay = rrand(i, 11) * 0.8;
    });

    this.apt = el('g', {}, this.deco);
    el('rect', { x: 213, y: 221, width: 12, height: 26, rx: 0.4, fill: '#FBF9F3', stroke: '#C6CBBE', 'stroke-width': 1.6 }, this.apt);
    this.aptWins = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 3; c++) {
      this.aptWins.push(el('rect', { x: 215 + c * 3.4, y: 223.5 + r * 3.7, width: 1.4, height: 1.6, rx: 0.15, fill: '#EFEBE0', stroke: '#C6CBBE', 'stroke-width': 1.1 }, this.apt));
    }
    this.enryoStub = el('path', { fill: 'none', stroke: '#81877C', 'stroke-width': 3, 'stroke-linecap': 'round' }, this.cam);

    this.ringsG = el('g', {}, this.cam);
    this.rings = RINGS.map(() => ({
      fill: el('circle', { fill: '#E8EEE2', opacity: 0 }, this.ringsG),
      line: el('circle', { fill: 'none', stroke: '#537257', 'stroke-width': 2 }, this.ringsG),
    }));

    this.lineGrey = el('path', { fill: 'none', stroke: '#9DA294', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.cam);
    this.line = el('path', { fill: 'none', stroke: '#537257', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.cam);

    this.knots = [];
    const kg = el('g', {}, this.cam);
    for (let i = 0; i < 6; i++) {
      const u = 596 + i * 6;
      const p = P(u);
      const g = el('g', { transform: `translate(${p[0]} ${p[1]})` }, kg);
      const side = i % 2 ? 1 : -1;
      el('path', { d: `M0 0C${side * 3.4} -2.6 ${side * 4.6} 1.6 ${side * 1.4} 1.9C${side * -0.6} 2.1 ${side * 0.2} -1.2 0 0Z`, fill: 'none', stroke: '#AA6A52', 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
      el('circle', { cx: 0, cy: 0, r: 0.75, fill: '#AA6A52' }, g);
      this.knots.push({ g, t: 89.6 + i * 0.42, side, p });
    }

    this.tip = el('circle', { r: 7, fill: '#537257' }, svg);
    this.tipGlow = el('circle', { r: 22, fill: '#537257', opacity: 0.12 }, svg);
    this.wl = root.querySelector('.wl');
  },
  update(lt, t, ctx) {
    const cam = camera(t);
    const { cx, cy, k } = cam;
    ctx.cam = cam;
    window.__ctx = ctx;
    ctx.w2s = (x, y) => [(x - cx) * k + 960, (y - cy) * k + 540];
    ctx.place = (node, x, y, { zref = 1, s = 1, ax = 0.5, ay = 0.5, r = 0 } = {}) => {
      const [sx, sy] = ctx.w2s(x, y);
      const sc = (cam.z / zref) * s;
      node.style.transformOrigin = `${ax * 100}% ${ay * 100}%`;
      node.style.left = '0px';
      node.style.top = '0px';
      const w = node.offsetWidth, h = node.offsetHeight;
      node.style.transform = `translate(${(sx - ax * w).toFixed(2)}px,${(sy - ay * h).toFixed(2)}px) rotate(${r}deg) scale(${sc.toFixed(4)})`;
    };
    this.cam.setAttribute('transform', `matrix(${k.toFixed(5)} 0 0 ${k.toFixed(5)} ${(960 - cx * k).toFixed(2)} ${(540 - cy * k).toFixed(2)})`);
    const fk = k * 0.55;
    this.far.setAttribute('transform', `matrix(${fk.toFixed(5)} 0 0 ${fk.toFixed(5)} ${(960 - cx * fk).toFixed(2)} ${(540 - cy * fk).toFixed(2)})`);

    const pull = easeInOut(seg(t, T_PULL, T_PULL + 2.4));
    const decoO = 1 - pull;
    this.deco.style.opacity = decoO.toFixed(3);
    this.far.style.opacity = (1 - pull).toFixed(3);

    const u = penU(t);
    ctx.penU = u;
    const turnU = tweenTurn(t, u);
    this.lineGrey.setAttribute('d', partialD(0, u));
    this.line.setAttribute('d', partialD(0, Math.min(u, turnU)));
    const lock = easeInOut(seg(t, T_PULL + 1.6, T_PULL_END + 0.4));
    const sw = lerp(6, 22 * (LOCK.size / 360), lock);
    this.line.setAttribute('stroke-width', sw.toFixed(2));
    this.line.setAttribute('stroke', lock > 0 ? mixHex('#537257', '#F8F5ED', lock) : '#537257');
    this.lineGrey.style.opacity = (t < 31 ? 1 : 1 - seg(t, 31, 32)).toFixed(3);
    this.iconBg.setAttribute('opacity', easeInOut(seg(t, T_PULL + 1.8, T_PULL_END + 0.2)).toFixed(3));

    const tp = ctx.w2s(...P(u));
    ctx.pen = tp;
    const tipO = 1 - seg(t, T_PULL, T_PULL + 0.8);
    const pulse = t < 1.3 ? 1 + 0.35 * Math.sin(t * 9) * Math.exp(-t * 1.2) : 1;
    const tipCol = t < turnStart ? '#81877C' : '#537257';
    this.tip.setAttribute('cx', tp[0].toFixed(2)); this.tip.setAttribute('cy', tp[1].toFixed(2));
    this.tip.setAttribute('r', (7 * pulse).toFixed(2));
    this.tip.setAttribute('fill', u >= turnU - 0.5 && t > turnStart ? '#537257' : tipCol);
    this.tip.style.opacity = tipO.toFixed(3);
    this.tipGlow.setAttribute('cx', tp[0].toFixed(2)); this.tipGlow.setAttribute('cy', tp[1].toFixed(2));
    this.tipGlow.setAttribute('r', (22 + 6 * Math.sin(t * 3.2)).toFixed(2));
    this.tipGlow.style.opacity = (tipO * 0.14).toFixed(3);
    this.tipGlow.setAttribute('fill', t > turnStart ? '#537257' : '#81877C');

    const stairsO = seg(t, 6.0, 8.0) * (1 - seg(t, 17, 19)) ;
    this.stairs.style.opacity = stairsO.toFixed(3);
    this.waves.style.opacity = (seg(t, 95.5, 97.5) * (1 - seg(t, 108, 110))).toFixed(3);

    this.apt.style.opacity = seg(t, 96.0, 97.4).toFixed(3);
    const ap = seg(t, 99.6, 100.1);
    this.aptWins.forEach((w, i) => w.setAttribute('fill', i === 10 && ap > 0 ? mixHex('#EFEBE0', '#E4B9A4', ap) : i === 13 && t > 101.2 ? '#D5DECF' : '#EFEBE0'));
    const vw = 1920 / k, vh = 1080 / k;
    for (const hs of this.houses) {
      const vis = Math.abs(hs.x - cx) < vw * 0.6 + 8 && Math.abs(hs.y - cy) < vh * 0.6 + 8;
      if (!vis) { if (hs._v !== 0) { hs.g.style.display = 'none'; hs._v = 0; } continue; }
      if (hs._v !== 1) { hs.g.style.display = ''; hs._v = 1; }
      const lp = seg(t, hs.lit, hs.lit + 0.35);
      const lit = lp > 0 ? mixHex('#EFEBE0', '#E4B9A4', lp) : '#EFEBE0';
      if (hs._lit !== lit) { hs.ws.forEach((w) => w.setAttribute('fill', lit)); hs._lit = lit; }
      const dp = spring(t - hs.del, 'snappy');
      const responded = hs.special === 'rahim' && t > 64.3;
      const dotO = (dp > 0 ? clamp(dp * 1.4) : 0) * (1 - seg(t, 66, 68) * (responded ? 0 : 1));
      const dk = `${dotO.toFixed(2)}|${responded}`;
      if (hs._dot !== dk) {
        hs.dot.setAttribute('opacity', dotO.toFixed(2));
        hs.dot.setAttribute('fill', responded ? '#AA6A52' : '#537257');
        hs._dot = dk;
      }
      const dr = responded ? 0.62 * (1 + 0.5 * spring(t - 64.3, 'playful')) : 0.62 * (0.4 + 0.6 * dp);
      hs.dot.setAttribute('r', Math.max(0.01, dr).toFixed(3));
      const doorLit = hs.special === 'rahim' ? (t > 64.3 ? '#AA6A52' : dp > 0.5 ? '#D5DECF' : '#EFEBE0') : hs.special === 'enryo' ? '#EFEBE0' : dp > 0.5 ? '#D5DECF' : '#EFEBE0';
      if (hs._door !== doorLit) { hs.door.setAttribute('fill', doorLit); hs._door = doorLit; }
      if (hs.stub) {
        const base = 0.22 * easeOut(seg(t, hs.lit + 0.3, hs.lit + 1.1));
        const conn = spring(t - (28.4 + hs.stubDelay), 'default');
        const f = t < hs.lit + 0.3 ? 0 : Math.max(base, Math.min(1, base + (1 - base) * conn));
        const [ax, ay] = hs.stubA, [bx, by] = hs.stubB;
        hs.stub.setAttribute('d', f > 0.002 ? `M${ax.toFixed(2)} ${ay.toFixed(2)}L${lerp(ax, bx, f).toFixed(2)} ${lerp(ay, by, f).toFixed(2)}` : '');
        hs.stub.setAttribute('opacity', (conn > 0.98 ? 0.8 : 0.55 + 0.25 * conn).toFixed(2));
      }
    }

    {
      const p = P(U.eave - 6);
      const nb = [this.enryoNbr.x + this.enryoNbr.w * 0.12 + 0.5, this.enryoNbr.y - 0.95];
      const ext = easeInOut(seg(t, 16.0, 17.4)) * 0.62 - easeInOut(seg(t, 18.0, 19.2)) * 0.62;
      const wob = Math.sin(t * 11) * 0.6 * seg(t, 16.8, 17.4) * (1 - seg(t, 17.8, 18.2));
      const ex = lerp(p[0], nb[0], ext), ey = lerp(p[1], nb[1], ext) + wob;
      const mx = (p[0] + ex) / 2 + 2, my = (p[1] + ey) / 2 - 3;
      this.enryoStub.setAttribute('d', ext > 0.01 ? `M${p[0]} ${p[1]}Q${mx} ${my} ${ex} ${ey}` : '');
    }

    const c = RIPPLE_C();
    this.rings.forEach((rg, j) => {
      const r = ringR(j, t);
      const o = seg(t, RINGS[j].t, RINGS[j].t + 0.2) * (1 - seg(t, 60.6, 61.6));
      rg.line.setAttribute('cx', c[0]); rg.line.setAttribute('cy', c[1]);
      rg.fill.setAttribute('cx', c[0]); rg.fill.setAttribute('cy', c[1]);
      rg.line.setAttribute('r', Math.max(0.01, r).toFixed(3));
      rg.fill.setAttribute('r', Math.max(0.01, r).toFixed(3));
      rg.line.setAttribute('opacity', (o * (0.9 - j * 0.12)).toFixed(3));
      rg.fill.setAttribute('opacity', (o * 0.32).toFixed(3));
    });

    for (const kn of this.knots) {
      const p = spring(t - kn.t, 'playful');
      const o = clamp(p * 2) * (1 - pull);
      kn.g.setAttribute('transform', `translate(${kn.p[0]} ${kn.p[1]}) scale(${Math.max(0.001, p * 1.5).toFixed(3)})`);
      kn.g.style.opacity = o.toFixed(3);
    }
  },
};

export const turnStart = 27.6;
function tweenTurn(t, u) {
  if (t < turnStart) return 0;
  const q = easeInOut(seg(t, turnStart, turnStart + 2.6));
  return lerp(0, 260, q) + (t > turnStart + 2.6 ? 1e4 : 0);
}

function rrand(i, s) { return rand(i * 0.731 + 0.17, s); }

function mixHex(a, b, p) {
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const r = lerp(A >> 16, B >> 16, p) | 0, g = lerp((A >> 8) & 255, (B >> 8) & 255, p) | 0, bb = lerp(A & 255, B & 255, p) | 0;
  return `rgb(${r},${g},${bb})`;
}
export { mixHex };
