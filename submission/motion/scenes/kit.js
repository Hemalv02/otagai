import { css, words, riseWords, spring, seg, clamp, easeIn, easeOut, lerp } from '../lib/motion.js';

export function headline(html, { x = 150, y = 820, size = 84, w = 1100, cls = '', eyebrow = '' } = {}) {
  return `<div class="abs hl ${cls}" style="left:${x}px;top:${y}px;width:${w}px">
    ${eyebrow ? `<div class="eyebrow halo eb" style="margin-bottom:18px">${words(eyebrow)}</div>` : ''}
    <div class="headline halo" style="font-size:${size}px">${html}</div></div>`;
}

export function playHead(el, t, t0, out, opts = {}) {
  if (!el) return;
  const vis = t > t0 - 0.1 && t < out + 0.8;
  el.style.display = vis ? '' : 'none';
  if (!vis) return;
  const eb = el.querySelector('.eb');
  if (eb) riseWords(eb, t, t0 - 0.12, { stagger: 0.04, preset: 'default', out });
  riseWords(el.querySelector('.headline'), t, t0, { stagger: opts.stagger ?? 0.075, preset: 'heavy', out });
}

export function typeText(el, text, t, t0, cps = 22, { caret = true, del = null, delCps = 40, keep = 0 } = {}) {
  const chars = [...text];
  let n = clamp(Math.floor((t - t0) * cps), 0, chars.length);
  if (del != null && t > del) n = Math.max(keep, n - Math.floor((t - del) * delCps));
  const blink = caret && Math.floor(t * 2.2) % 2 === 0;
  const showCaret = caret && t > t0 - 0.6;
  const key = n + '|' + (showCaret && blink);
  if (el._k === key) return n;
  el._k = key;
  el.innerHTML = chars.slice(0, n).join('') + (showCaret ? `<span class="caret" style="opacity:${blink ? 1 : 0}"></span>` : '');
  return n;
}

export function morph(el, t, t0, { stagger = 0.022, dur = 0.32 } = {}) {
  const from = el.querySelectorAll('.from .g'), to = el.querySelectorAll('.to .g');
  from.forEach((g, i) => {
    const q = easeIn(seg(t, t0 + i * stagger, t0 + i * stagger + dur));
    g.style.transform = `translateY(${(-q * 0.25).toFixed(3)}em) scale(${(1 - q * 0.85).toFixed(3)})`;
    g.style.opacity = (1 - q).toFixed(3);
  });
  const lag = Math.min(from.length * stagger * 0.5, 0.5);
  to.forEach((g, i) => {
    const p = spring(t - (t0 + lag + i * stagger), 'snappy');
    g.style.transform = `translateY(${((1 - p) * 0.3).toFixed(3)}em) scale(${(0.2 + 0.8 * p).toFixed(3)})`;
    g.style.opacity = clamp(p * 1.6).toFixed(3);
  });
  const fromL = el.querySelector('.from'), toL = el.querySelector('.to');
  if (fromL) fromL.style.visibility = t > t0 + from.length * stagger + dur + 0.05 ? 'hidden' : 'visible';
  if (toL) toL.style.visibility = t > t0 - 0.01 ? 'visible' : 'hidden';
}

export function enter(el, t, t0, { preset = 'default', dy = 70, dx = 0, s0 = 0.96, out = null, outDy = -40, outDur = 0.45 } = {}) {
  if (!el) return 0;
  const p = spring(t - t0, preset);
  let o = clamp(p * 1.6), y = (1 - p) * dy, x = (1 - p) * dx, s = lerp(s0, 1, p);
  if (out != null) {
    const q = easeIn(seg(t, out, out + outDur));
    o *= 1 - q; y += q * outDy;
  }
  el.style.display = o > 0.002 ? '' : 'none';
  css(el, { x, y, s, o });
  return p;
}

export function press(t, t0) {
  if (t < t0 - 0.12) return 1;
  if (t < t0) return 1 - (0.06 * (t - t0 + 0.12)) / 0.12;
  return 1 - 0.06 * Math.exp(-(t - t0) * 9) * Math.cos((t - t0) * 12);
}

export function tapRing(el, t, t0) {
  if (!el) return;
  const q = seg(t, t0, t0 + 0.6);
  el.style.opacity = (q > 0 && q < 1 ? (1 - q) * 0.5 : 0).toFixed(3);
  el.style.transform = `translate(-50%,-50%) scale(${(0.3 + easeOut(q) * 1.4).toFixed(3)})`;
}

export const tapHTML = (x, y, size = 120) =>
  `<div class="abs tap" style="left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:50%;background:#537257;opacity:0;pointer-events:none"></div>`;

export function counter(el, t, t0, t1, to, dec = 0, suffix = '') {
  const p = easeOut(seg(t, t0, t1));
  const v = (to * p).toFixed(dec);
  if (el._v !== v) { el.textContent = v + suffix; el._v = v; }
}

export { css, words, riseWords, spring, seg, clamp, easeIn, easeOut, lerp };
