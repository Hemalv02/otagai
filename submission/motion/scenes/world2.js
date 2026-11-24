import { clamp, lerp, seg, easeInOut, easeOut, expoOut, spring, track, rand, noise1 } from '../lib/motion.js';
import { S, P, partialD, nearestU, TOTAL, mixHex } from './world.js';

const V = { peak: 34.7, eave: 132.6, wallEnd: 223.6, floorEnd: 325.6, junction: 392.6, rahim: 440 };
export const U = V;

function mono(knots) {
  const n = knots.length, xs = knots.map((k) => k[0]), ys = knots.map((k) => k[1]);
  const d = [], m = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (3 * (d[i - 1] + d[i])) / ((2 * d[i] + d[i - 1]) / d[i - 1] + (d[i] + 2 * d[i - 1]) / d[i]);
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

const PEN = [
  [0, 0], [1.0, 0], [4.8, 33], [9.4, 110], [12.8, 124], [17.2, 214], [18.6, 262], [20.0, 300],
  [25.0, 302], [34.8, 318], [42.2, V.floorEnd], [53.0, 384], [54.0, V.junction], [63.4, V.junction],
  [65.0, V.rahim], [74.4, 446], [84.6, 505], [94.8, 560], [104.8, 646], [114.8, 680], [124.8, 700],
  [139.8, 714], [150.0, TOTAL], [170, TOTAL],
];
export const penU = mono(PEN);
const camU = mono(PEN.map(([t, u]) => [t, t > 63.4 && t < 74.5 ? (t < 65 ? lerp(V.junction, 416, (t - 63.4) / 1.6) : 416) : u]));

const FRAME = [
  [0, [960, 540]], [2.0, [1210, 360], 'soft'], [5.0, [1250, 250], 'soft'], [9.4, [1180, 400], 'soft'],
  [12.8, [960, 300], 'soft'], [17.2, [640, 640], 'soft'], [18.8, [1250, 640], 'soft'],
  [24.6, [300, 860], 'soft'], [42.2, [300, 700], 'soft'], [54.0, [760, 560], 'soft'],
  [63.2, [960, 600], 'soft'], [74.6, [330, 300], 'soft'], [84.4, [330, 300], 'soft'], [94.6, [1690, 400], 'soft'],
  [99.0, [1690, 820], 'soft'], [104.8, [300, 900], 'soft'], [124.6, [760, 560], 'soft'], [139.8, [1600, 900], 'soft'],
];
const ZOOM = [
  [0, 2.1], [1.6, 1.0, 'soft'], [12.8, 0.62, 'soft'], [17.2, 0.86, 'soft'], [24.6, 0.9, 'soft'],
  [54.0, 0.56, 'soft'], [63.2, 0.74, 'soft'], [74.6, 0.9, 'soft'], [104.8, 0.86, 'soft'],
  [124.6, 0.46, 'soft'], [139.8, 0.9, 'soft'],
];
export const T_PULL = 152.0;
const T_PULL_END = 157.0;
export const LOCK = { mx: 180, my: 180, sx: 640, sy: 540, size: 560 };

export function camera(t) {
  const p = P(camU(t));
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

export const RINGS = [
  { r: 12, t: 55.6, label: 'Family' },
  { r: 24, t: 56.9, label: 'Your circle' },
  { r: 38, t: 58.2, label: 'Association' },
  { r: 56, t: 59.5, label: 'Nearby within 3 km' },
];
export const ringR = (j, t) => RINGS[j].r * expoOut(seg(t, RINGS[j].t, RINGS[j].t + 1.5));
export const T_ALERT = 127.5;
export const KNOT_T = (i) => 100.2 + i * 0.4;
export const T_TURN = 17.5;
export const T_OFFER = 66.4;

const rr = (i, s) => rand(i * 0.731 + 0.17, s);

export default {
  id: 'world2',
  start: 0,
  end: 171,
  build(root) {
    root.innerHTML = `<svg class="wsvg" width="1920" height="1080" viewBox="0 0 1920 1080"><g class="far"></g><g class="cam"></g></svg>`;
    const svg = root.querySelector('svg');
    this.far = svg.querySelector('.far');
    this.cam = svg.querySelector('.cam');
    this.contours = [];
    for (let i = 0; i < 34; i++) {
      const y0 = 10 + i * 10;
      let d = '';
      for (let x = -260; x <= 620; x += 6) {
        const y = y0 + noise1(x * 0.011 + i * 2.3, 5) * 10 + noise1(x * 0.035 + i, 2) * 2.2;
        d += (x === -260 ? 'M' : 'L') + x + ' ' + y.toFixed(2);
      }
      this.contours.push(el('path', { d, fill: 'none', stroke: i % 5 === 0 ? '#D3D8C9' : '#E2DFD3', 'stroke-width': i % 5 === 0 ? 1.5 : 1.1 }, this.far));
    }
    this.iconBg = el('rect', { x: 0, y: 0, width: 360, height: 360, rx: 80, fill: '#537257', opacity: 0 }, this.cam);
    this.deco = el('g', {}, this.cam);
    this.alertRing = el('circle', { fill: 'none', stroke: '#AA6A52', 'stroke-width': 3, opacity: 0 }, this.cam);
    this.ringsG = el('g', {}, this.cam);
    this.rings = RINGS.map(() => ({
      fill: el('circle', { fill: '#E8EEE2', opacity: 0 }, this.ringsG),
      line: el('circle', { fill: 'none', stroke: '#537257', 'stroke-width': 2 }, this.ringsG),
    }));

    const jc = P(V.junction);
    const W0 = P(170);
    this.nodes = [];
    let id = 0;
    for (let gy = 30; gy <= 330; gy += 9) {
      for (let gx = -120; gx <= 470; gx += 9) {
        id++;
        if (rr(id, 7) < 0.38) continue;
        const x = gx + rr(id, 1) * 6 - 3, y = gy + rr(id, 2) * 6 - 3;
        const [, dist] = nearestU(x, y);
        if (dist < 4.5) continue;
        const g = el('g', { transform: `translate(${x.toFixed(2)} ${y.toFixed(2)})` }, this.deco);
        const halo = el('circle', { r: 1.6, fill: '#537257', opacity: 0 }, g);
        const dot = el('circle', { r: 0.62, fill: '#C9CEC1' }, g);
        const n = { x, y, g, dot, halo, lit: Infinity, del: Infinity, stub: null, help: false, safe: Infinity };
        const dl = Math.hypot(x - W0[0], y - W0[1]);
        if (dl < 64) n.lit = 13.6 + dl * 0.05 + rr(id, 8) * 0.5;
        const dr = Math.hypot(x - jc[0], y - jc[1]);
        for (let j = 0; j < RINGS.length; j++) {
          if (dr <= RINGS[j].r && (j === 0 || dr > RINGS[j - 1].r)) {
            const q = Math.log(1 - Math.min(0.999, (dr / RINGS[j].r) * 0.999)) / -10;
            n.del = RINGS[j].t + q * 1.5;
          }
        }
        n.help = rr(id, 13) < 0.06;
        n.safe = 129.4 + rr(id, 14) * 5.5;
        if (rr(id, 15) < 0.12) n.safe = Infinity;
        this.nodes.push(n);
      }
    }
    this.nodes.filter((n) => n.lit < 40).forEach((n, i) => {
      if (i % 2) return;
      const [nu, d] = nearestU(n.x, n.y);
      if (d > 34) return;
      const tp = P(nu);
      n.stub = el('path', { d: '', fill: 'none', stroke: '#537257', 'stroke-width': 1.6, 'stroke-linecap': 'round' }, this.deco);
      n.stubB = tp;
      n.stubDelay = rr(i, 11) * 0.8;
    });
    this.rahimNode = this.nodes.reduce((b, n) => (Math.hypot(n.x - 228, n.y - 170) < Math.hypot(b.x - 228, b.y - 170) ? n : b), this.nodes[0]);
    this.rahimNode.help = false;

    this.enryoStub = el('path', { fill: 'none', stroke: '#81877C', 'stroke-width': 3, 'stroke-linecap': 'round' }, this.cam);
    this.lineGrey = el('path', { fill: 'none', stroke: '#9DA294', 'stroke-width': 3, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.cam);
    this.line = el('path', { fill: 'none', stroke: '#537257', 'stroke-width': 6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, this.cam);

    this.knots = [];
    const kg = el('g', {}, this.cam);
    for (let i = 0; i < 6; i++) {
      const p = P(596 + i * 6);
      const g = el('g', {}, kg);
      const side = i % 2 ? 1 : -1;
      el('path', { d: `M0 0C${side * 3.4} -2.6 ${side * 4.6} 1.6 ${side * 1.4} 1.9C${side * -0.6} 2.1 ${side * 0.2} -1.2 0 0Z`, fill: 'none', stroke: '#AA6A52', 'stroke-width': 3, 'stroke-linejoin': 'round' }, g);
      el('circle', { cx: 0, cy: 0, r: 0.75, fill: '#AA6A52' }, g);
      this.knots.push({ g, t: KNOT_T(i), p });
    }
    this.tip = el('circle', { r: 7, fill: '#537257' }, svg);
    this.tipGlow = el('circle', { r: 22, fill: '#537257', opacity: 0.12 }, svg);
  },
  update(lt, t, ctx) {
    const cam = camera(t);
    const { cx, cy, k } = cam;
    ctx.cam = cam;
    ctx.w2s = (x, y) => [(x - cx) * k + 960, (y - cy) * k + 540];
    ctx.place = (node, x, y, { zref = 1, s = 1, ax = 0.5, ay = 0.5, r = 0 } = {}) => {
      const [sx, sy] = ctx.w2s(x, y);
      const sc = (cam.z / zref) * s;
      node.style.transformOrigin = `${ax * 100}% ${ay * 100}%`;
      node.style.left = '0px';
      node.style.top = '0px';
      node.style.transform = `translate(${(sx - ax * node.offsetWidth).toFixed(2)}px,${(sy - ay * node.offsetHeight).toFixed(2)}px) rotate(${r}deg) scale(${sc.toFixed(4)})`;
    };
    this.cam.setAttribute('transform', `matrix(${k.toFixed(5)} 0 0 ${k.toFixed(5)} ${(960 - cx * k).toFixed(2)} ${(540 - cy * k).toFixed(2)})`);
    const fk = k * 0.55;
    this.far.setAttribute('transform', `matrix(${fk.toFixed(5)} 0 0 ${fk.toFixed(5)} ${(960 - cx * fk).toFixed(2)} ${(540 - cy * fk).toFixed(2)})`);

    const alert = seg(t, T_ALERT - 2.2, T_ALERT - 1.6) * (1 - seg(t, 136.5, 139.0));
    const contourCol = alert > 0 ? mixHex('#E2DFD3', '#E9D3C8', alert) : '#E2DFD3';
    if (this._cc !== contourCol) { this._cc = contourCol; this.contours.forEach((c, i) => { if (i % 5) c.setAttribute('stroke', contourCol); }); }
    ctx.alert = alert;

    const pull = easeInOut(seg(t, T_PULL, T_PULL + 2.4));
    this.deco.style.opacity = (1 - pull).toFixed(3);
    this.far.style.opacity = (1 - pull).toFixed(3);

    const u = penU(t);
    ctx.penU = u;
    const turnU = t < T_TURN ? 0 : lerp(0, 262, easeInOut(seg(t, T_TURN, T_TURN + 1.6))) + (t > T_TURN + 1.6 ? 1e4 : 0);
    this.lineGrey.setAttribute('d', partialD(0, u));
    this.line.setAttribute('d', partialD(0, Math.min(u, turnU)));
    const lock = easeInOut(seg(t, T_PULL + 1.6, T_PULL_END + 0.4));
    this.line.setAttribute('stroke-width', lerp(6, 22 * (LOCK.size / 360), lock).toFixed(2));
    this.line.setAttribute('stroke', lock > 0 ? mixHex('#537257', '#F8F5ED', lock) : alert > 0.01 ? mixHex('#537257', '#AA6A52', alert * 0.85) : '#537257');
    this.lineGrey.style.opacity = (1 - seg(t, T_TURN + 1.6, T_TURN + 2.4)).toFixed(3);
    this.iconBg.setAttribute('opacity', easeInOut(seg(t, T_PULL + 1.8, T_PULL_END + 0.2)).toFixed(3));

    const tp = ctx.w2s(...P(u));
    ctx.pen = tp;
    const tipO = 1 - seg(t, T_PULL, T_PULL + 0.8);
    const pulse = t < 1.3 ? 1 + 0.35 * Math.sin(t * 9) * Math.exp(-t * 1.2) : 1;
    const tipCol = t < T_TURN ? '#81877C' : alert > 0.5 ? '#AA6A52' : '#537257';
    for (const c of [this.tip, this.tipGlow]) { c.setAttribute('cx', tp[0].toFixed(2)); c.setAttribute('cy', tp[1].toFixed(2)); c.setAttribute('fill', tipCol); }
    this.tip.setAttribute('r', (7 * pulse).toFixed(2));
    this.tip.style.opacity = tipO.toFixed(3);
    this.tipGlow.setAttribute('r', (22 + 6 * Math.sin(t * 3.2)).toFixed(2));
    this.tipGlow.style.opacity = (tipO * 0.14).toFixed(3);

    const ap = seg(t, T_ALERT, T_ALERT + 2.6);
    const ac = P(u);
    this.alertRing.setAttribute('cx', ac[0]); this.alertRing.setAttribute('cy', ac[1]);
    this.alertRing.setAttribute('r', Math.max(0.01, 70 * expoOut(ap)).toFixed(2));
    this.alertRing.setAttribute('opacity', (ap > 0 && ap < 1 ? (1 - ap) * 0.9 : 0).toFixed(3));

    const vw = 1920 / k, vh = 1080 / k;
    for (const n of this.nodes) {
      const vis = Math.abs(n.x - cx) < vw * 0.6 + 4 && Math.abs(n.y - cy) < vh * 0.6 + 4;
      if (!vis) { if (n._v !== 0) { n.g.style.display = 'none'; n._v = 0; } continue; }
      if (n._v !== 1) { n.g.style.display = ''; n._v = 1; }
      let col = '#C9CEC1', r = 0.62, halo = 0, haloCol = '#537257';
      const lp = seg(t, n.lit, n.lit + 0.35);
      if (lp > 0 && t < 30) { col = mixHex('#C9CEC1', '#C98E77', lp); r = 0.62 + 0.18 * lp; }
      else if (t >= 30 && n.lit < 40) col = '#C3CBBE';
      const dp = spring(t - n.del, 'snappy');
      if (dp > 0 && t < 70) { col = mixHex(col, '#537257', clamp(dp)); r = 0.62 + 0.25 * dp; halo = (1 - clamp((t - n.del) / 1.2)) * 0.35; }
      if (n === this.rahimNode && t > T_OFFER && t < 76) { col = '#AA6A52'; r = 0.62 + 0.5 * spring(t - T_OFFER, 'playful'); halo = 0.25; haloCol = '#AA6A52'; }
      if (t > 64 && t < 70 && n !== this.rahimNode && n.del < 70) col = mixHex('#537257', '#C3CBBE', seg(t, 64, 66));
      if (alert > 0.01) {
        const hit = seg(t, T_ALERT + Math.hypot(n.x - ac[0], n.y - ac[1]) * 0.03, T_ALERT + 0.3 + Math.hypot(n.x - ac[0], n.y - ac[1]) * 0.03);
        if (hit > 0) { col = mixHex('#C3CBBE', '#D9A893', hit); r = 0.7; }
        if (n.help && t > 130.2) { col = '#AA6A52'; r = 0.9; halo = 0.25 + 0.2 * Math.sin(t * 6); haloCol = '#AA6A52'; }
        else if (t > n.safe) { const sp = spring(t - n.safe, 'snappy'); col = mixHex('#D9A893', '#537257', clamp(sp)); r = 0.7 + 0.15 * sp; halo = (1 - clamp((t - n.safe) / 0.8)) * 0.3; }
        if (t > 136.5) col = mixHex(col, '#C3CBBE', seg(t, 136.5, 139));
      }
      const key = col + r.toFixed(2) + halo.toFixed(2) + haloCol;
      if (n._k !== key) {
        n._k = key;
        n.dot.setAttribute('fill', col);
        n.dot.setAttribute('r', r.toFixed(3));
        n.halo.setAttribute('opacity', Math.max(0, halo).toFixed(3));
        n.halo.setAttribute('fill', haloCol);
      }
      if (n.stub) {
        const base = 0.22 * easeOut(seg(t, n.lit + 0.3, n.lit + 1.1));
        const conn = spring(t - (T_TURN + 0.5 + n.stubDelay), 'default');
        const f = t < n.lit + 0.3 ? 0 : Math.max(base, Math.min(1, base + (1 - base) * conn));
        const [bx, by] = n.stubB;
        n.stub.setAttribute('d', f > 0.002 ? `M${n.x.toFixed(2)} ${n.y.toFixed(2)}L${lerp(n.x, bx, f).toFixed(2)} ${lerp(n.y, by, f).toFixed(2)}` : '');
        n.stub.setAttribute('opacity', (t > 30 ? 0.35 : 0.55 + 0.25 * conn).toFixed(2));
      }
    }

    {
      const p = P(126);
      const nb = [p[0] - 14, p[1] - 9];
      const ext = easeInOut(seg(t, 10.2, 11.2)) * 0.7 - easeInOut(seg(t, 11.8, 12.7)) * 0.7;
      const wob = Math.sin(t * 11) * 0.6 * seg(t, 10.9, 11.3) * (1 - seg(t, 11.6, 11.9));
      const ex = lerp(p[0], nb[0], ext), ey = lerp(p[1], nb[1], ext) + wob;
      this.enryoStub.setAttribute('d', ext > 0.01 ? `M${p[0]} ${p[1]}Q${(p[0] + ex) / 2 + 2} ${(p[1] + ey) / 2 - 3} ${ex} ${ey}` : '');
    }

    const c = P(V.junction);
    this.rings.forEach((rg, j) => {
      const r = ringR(j, t);
      const o = seg(t, RINGS[j].t, RINGS[j].t + 0.2) * (1 - seg(t, 62.4, 63.4));
      for (const e of [rg.line, rg.fill]) { e.setAttribute('cx', c[0]); e.setAttribute('cy', c[1]); e.setAttribute('r', Math.max(0.01, r).toFixed(3)); }
      rg.line.setAttribute('opacity', (o * (0.9 - j * 0.12)).toFixed(3));
      rg.fill.setAttribute('opacity', (o * 0.32).toFixed(3));
    });
    for (const kn of this.knots) {
      const p = spring(t - kn.t, 'playful');
      kn.g.setAttribute('transform', `translate(${kn.p[0]} ${kn.p[1]}) scale(${Math.max(0.001, p * 1.5).toFixed(3)})`);
      kn.g.style.opacity = (clamp(p * 2) * (1 - pull)).toFixed(3);
    }
  },
};
