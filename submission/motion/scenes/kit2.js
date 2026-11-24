import { spring, seg, clamp, lerp, easeIn, easeOut, easeInOut, expoOut, track, css } from '../lib/motion.js';

export function rel(node, root) {
  let x = 0, y = 0, n = node;
  while (n && n !== root) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return [x, y, node.offsetWidth, node.offsetHeight];
}

export function devAt(dev, cx, cy = 540) {
  dev.style.left = `${cx - 207}px`;
  dev.style.top = `${cy - 434}px`;
}

// Shared per-frame zoom level so the HUD can step aside during punch-ins.
export const zoomState = { t: -1, s: 1 };

// mode 'hold': headlines leave the rig and stay put; the zoomed focus lands right of centre (ax px)
// so the punched-in phone sits beside the copy. mode 'fade': headlines ride the rig and fade out.
export function zoomRig(rig, t, keys, { mode = 'hold', ax = 300 } = {}) {
  if (!rig._hl) {
    rig._hl = [...rig.querySelectorAll(':scope > .hl')];
    if (mode === 'hold') for (const h of rig._hl) rig.parentNode.appendChild(h);
  }
  const [fx, fy, s] = track(t, keys, 'default');
  const z = clamp((s - 1) / 0.35);
  const cx = mode === 'hold' ? 960 + ax * z : 960;
  rig.style.transform = `translate(${cx.toFixed(2)}px,540px) scale(${s.toFixed(4)}) translate(${(-fx).toFixed(2)}px,${(-fy).toFixed(2)}px)`;
  if (mode === 'fade') for (const h of rig._hl) h.style.opacity = clamp(1 - (s - 1) / 0.2).toFixed(3);
  else tidy(rig, cx, fx, fy, s);
  if (zoomState.t !== t) { zoomState.t = t; zoomState.s = s; } else zoomState.s = Math.max(zoomState.s, s);
  return s;
}

function box(n) {
  let w = n.offsetWidth, h = n.offsetHeight;
  if (!w && n.style.display === 'none') { n.style.display = ''; w = n.offsetWidth; h = n.offsetHeight; n.style.display = 'none'; }
  return [n.offsetLeft, n.offsetTop, w, h];
}

// While punched in: fade copy that a scaled phone now covers, and callouts pushed past the frame edge.
function tidy(rig, cx, fx, fy, s) {
  const map = ([x, y, w, h]) => [cx + s * (x - fx), 540 + s * (y - fy), w * s, h * s];
  const devs = s > 1.01 ? [...rig.querySelectorAll('.dev')].filter((d) => d.offsetWidth && d.style.display !== 'none').map((d) => map(rel(d, rig))) : [];
  for (const h of rig._hl) {
    const [x, y, w, hh] = box(h);
    let cover = 0;
    for (const [dx, dy, dw, dh] of devs) {
      const ix = Math.max(0, Math.min(x + w, dx + dw) - Math.max(x, dx - 30));
      const iy = Math.max(0, Math.min(y + hh, dy + dh) - Math.max(y, dy));
      cover = Math.max(cover, (ix * iy) / Math.max(1, w * hh));
    }
    h.style.opacity = clamp(1 - cover / 0.04).toFixed(3);
  }
  rig._co ??= [...rig.querySelectorAll('.callout')];
  for (const c of rig._co) {
    if (s <= 1.01) { c.style.filter = 'none'; continue; }
    const [x, y, w, h] = map(box(c));
    const off = Math.max(0, x + w - 1890, 30 - x) / Math.max(1, w) + Math.max(0, y + h - 1060, 20 - y) / Math.max(1, h);
    c.style.filter = `opacity(${clamp(1 - off * 5).toFixed(3)})`;
  }
}

export function focusOn(dev, node, extra = 0) {
  const inner = dev.querySelector('.dev-in');
  const [x, y, w, h] = rel(node, inner);
  return [dev.offsetLeft + 12 + x + w / 2 + extra, dev.offsetTop + 12 + y + h / 2];
}

export function swap(screens, t, times, { dur = 0.5, kind = 'push' } = {}) {
  let cur = 0;
  for (let i = 0; i < times.length; i++) if (t >= times[i]) cur = i;
  screens.forEach((s, i) => {
    const tin = times[i];
    const tout = i + 1 < times.length ? times[i + 1] : Infinity;
    const pin = i === 0 ? 1 : easeInOut(seg(t, tin, tin + dur));
    const pout = easeInOut(seg(t, tout, tout + dur));
    const vis = t >= tin && t < tout + dur;
    s.style.display = vis ? '' : 'none';
    if (!vis) return;
    if (kind === 'push') {
      const x = (1 - pin) * 100 - pout * 30;
      s.style.transform = `translateX(${x.toFixed(2)}%)`;
      s.style.filter = pout > 0 ? `brightness(${(1 - pout * 0.08).toFixed(3)})` : 'none';
      s.style.zIndex = String(i);
    } else {
      s.style.opacity = (pin * (1 - pout)).toFixed(3);
      s.style.transform = 'none';
    }
  });
  return cur;
}

export function sheet(node, t, tin, tout = Infinity) {
  const p = spring(t - tin, 'default');
  const q = tout === Infinity ? 0 : easeIn(seg(t, tout, tout + 0.4));
  const y = (1 - p) * 100 + q * 100;
  node.style.display = p > 0.001 && q < 0.999 ? '' : 'none';
  node.style.transform = `translateY(${y.toFixed(2)}%)`;
}

export function scrim(node, t, tin, tout = Infinity) {
  node.style.opacity = (seg(t, tin, tin + 0.3) * (tout === Infinity ? 1 : 1 - seg(t, tout, tout + 0.3)) * 0.28).toFixed(3);
}

export function taps(ring, dev, t, list) {
  const inner = dev.querySelector('.dev-in');
  let cur = null;
  for (const tp of list) if (t >= tp[0] - 0.1 && t < tp[0] + 0.7) cur = tp;
  if (!cur) { ring.style.opacity = 0; return; }
  const [t0, node, offsetY = 0] = cur;
  const [x, y, w, h] = rel(node, inner);
  const q = seg(t, t0, t0 + 0.6);
  ring.style.left = `${x + w / 2}px`;
  ring.style.top = `${y + h / 2 + offsetY}px`;
  ring.style.opacity = (t < t0 ? seg(t, t0 - 0.1, t0) * 0.35 : (1 - q) * 0.35).toFixed(3);
  ring.style.transform = `translate(-50%,-50%) scale(${(t < t0 ? 0.5 : 0.5 + easeOut(q) * 1.1).toFixed(3)})`;
}

export const tapRingHTML = '<div class="tapr" style="position:absolute;width:96px;height:96px;border-radius:50%;background:#303630;opacity:0;pointer-events:none;z-index:99"></div>';

export function press(node, t, t0) {
  let s = 1;
  if (t >= t0 - 0.12 && t < t0) s = 1 - (0.05 * (t - t0 + 0.12)) / 0.12;
  else if (t >= t0) s = 1 - 0.05 * Math.exp(-(t - t0) * 9) * Math.cos((t - t0) * 12);
  node.style.transform = `scale(${s.toFixed(4)})`;
}

export function show(node, t, tin, tout = Infinity, { dy = 18, preset = 'default', s0 = 1 } = {}) {
  const p = spring(t - tin, preset);
  const q = tout === Infinity ? 0 : easeIn(seg(t, tout, tout + 0.3));
  const o = clamp(p * 1.6) * (1 - q);
  node.style.display = o > 0.002 ? '' : 'none';
  node.style.opacity = o.toFixed(3);
  node.style.transform = `translateY(${((1 - p) * dy).toFixed(2)}px) scale(${lerp(s0, 1, p).toFixed(4)})`;
  return p;
}

export function setText(node, txt) { if (node._t !== txt) { node._t = txt; node.textContent = txt; } }
export function setHTML(node, h) { if (node._h !== h) { node._h = h; node.innerHTML = h; } }
export function cls(node, c, on) { if (node._c?.[c] !== on) { node._c = { ...(node._c || {}), [c]: on }; node.classList.toggle(c, on); } }

export function trans(el, t, { tin, kin = 'fade', tout, kout = 'fade', din = 0.75, dout = 0.65, ox = 960, oy = 540 }) {
  let x = 0, y = 0, s = 1, o = 1, blur = 0, ry = 0, clip = null;
  if (tin != null && t < tin + din) {
    const p = seg(t, tin, tin + din), e = easeOut(p), sp = spring(t - tin, 'heavy');
    if (kin === 'whipR') { x = 2300 * (1 - e); blur = (1 - e) * 28; }
    else if (kin === 'whipL') { x = -2300 * (1 - e); blur = (1 - e) * 28; }
    else if (kin === 'rise') { y = (1 - sp) * 900; }
    else if (kin === 'push') { s = lerp(1.9, 1, e); blur = (1 - e) * 22; o = clamp(p * 2.5); }
    else if (kin === 'pull') { s = lerp(0.6, 1, e); o = clamp(p * 2); }
    else if (kin === 'flip') { ry = -90 * (1 - e); o = p > 0.02 ? 1 : 0; }
    else if (kin === 'flood') { clip = `circle(${(expoOut(p) * 2300).toFixed(1)}px at ${ox}px ${oy}px)`; }
    else if (kin === 'wipe') { clip = `inset(0 0 0 ${((1 - easeInOut(p)) * 100).toFixed(2)}%)`; }
    else o = p;
  }
  if (tout != null && t > tout) {
    const p = seg(t, tout, tout + dout), e = easeIn(p);
    if (kout === 'whipL') { x -= 2300 * e; blur += e * 28; }
    else if (kout === 'whipR') { x += 2300 * e; blur += e * 28; }
    else if (kout === 'drop') { y += e * 1100; }
    else if (kout === 'push') { s *= lerp(1, 2.2, e); blur += e * 20; o *= 1 - clamp(p * 1.6 - 0.4); }
    else if (kout === 'flip') { ry += 90 * e; }
    else if (kout === 'none') {}
    else o *= 1 - p;
  }
  const tf = `${ry ? 'perspective(1800px) ' : ''}translate3d(${x.toFixed(1)}px,${y.toFixed(1)}px,0)${ry ? ` rotateY(${ry.toFixed(2)}deg)` : ''} scale(${s.toFixed(4)})`;
  el.style.transform = tf;
  el.style.transformOrigin = `${ox}px ${oy}px`;
  el.style.opacity = clamp(o).toFixed(3);
  el.style.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : 'none';
  el.style.clipPath = clip || 'none';
}

export { spring, seg, clamp, lerp, easeIn, easeOut, easeInOut, expoOut, track, css };
