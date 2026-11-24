import { headline, playHead, typeText, enter, counter, words, riseWords, spring, seg, clamp, css, easeOut, easeIn } from './kit.js';
import { P } from './world.js';
import { avatar, TANAKA, icon, glyphs } from '../lib/ui.js';
import { morph } from './kit.js';

export const hook = {
  id: 'hook', start: 0, end: 5, post: 0.5,
  build(el) {
    el.innerHTML = `
      <div class="abs" style="left:150px;top:540px;width:900px">
        <div class="eyebrow halo eb">${words('Nagasaki City · aged 65+')}</div>
        <div class="halo num" style="font:600 230px/1 var(--sans);letter-spacing:-0.06em;color:var(--ink);margin-top:10px"><span class="n">0.0</span><span style="color:var(--clay)">%</span></div>
        <div class="headline halo sub" style="font-size:54px;margin-top:14px;color:var(--secondary)">${words('One in three people is over 65.')}</div>
        <div class="mono src halo" style="font-size:17px;letter-spacing:.08em;color:var(--control);margin-top:26px">SOURCE · NAGASAKI CITY, MAR 2025</div>
      </div>`;
    this.eb = el.querySelector('.eb'); this.num = el.querySelector('.num'); this.n = el.querySelector('.n');
    this.sub = el.querySelector('.sub'); this.src = el.querySelector('.src');
  },
  update(lt, t) {
    riseWords(this.eb, t, 0.9, { stagger: 0.04, preset: 'default', out: 4.7 });
    const p = spring(t - 1.0, 'heavy'), q = easeIn(seg(t, 4.6, 5.1));
    css(this.num, { y: (1 - p) * 60 - q * 40, o: clamp(p * 1.4) * (1 - q) });
    counter(this.n, t, 1.0, 2.6, 34.9, 1);
    riseWords(this.sub, t, 2.0, { stagger: 0.05, out: 4.75 });
    css(this.src, { o: seg(t, 2.8, 3.2) * (1 - seg(t, 4.6, 4.9)) });
  },
};

const TAGS = ['Rice up the steps', 'Garbage out by 8', 'A bulb, just out of reach'];
export const steps = {
  id: 'steps', start: 5, end: 9.5, pre: 0.4, post: 0.6,
  build(el) {
    el.innerHTML = `
      <div class="print ph" style="left:150px;top:120px;width:860px;height:640px"><img src="assets/request-mizunoura-steps.png" style="filter:saturate(.7) sepia(.12)"><div class="cap">Mizunoura, Nagasaki</div></div>
      ${TAGS.map((l, i) => `<div class="abs tag" style="left:${700 + i * 40}px;top:${300 + i * 130}px;display:flex;align-items:center;gap:14px;padding:18px 26px;background:#fff;border-radius:14px;box-shadow:var(--shadow);font:600 32px var(--sans);letter-spacing:-.02em;white-space:nowrap"><span style="width:13px;height:13px;border-radius:50%;background:var(--clay)"></span>${l}</div>`).join('')}
      ${headline(`${words('Small troubles.')}<br><span class="em">${words('Every day.')}</span>`, { x: 1180, y: 760, size: 92, w: 700 })}`;
    this.ph = el.querySelector('.ph'); this.tags = [...el.querySelectorAll('.tag')]; this.hl = el.querySelector('.hl');
  },
  update(lt, t) {
    const pp = spring(t - 4.8, 'heavy'), pq = easeIn(seg(t, 9.2, 9.8));
    css(this.ph, { r: -1.6, y: (1 - pp) * 90 - pq * 60, x: -pq * 200, s: 0.94 + 0.06 * pp + (t - 5) * 0.004, o: clamp(pp * 1.5) * (1 - pq) });
    this.tags.forEach((tg, i) => {
      const s = spring(t - (5.6 + i * 0.75), 'playful');
      const q = easeIn(seg(t, 9.0 + i * 0.05, 9.4 + i * 0.05));
      css(tg, { s: 0.7 + 0.3 * s, r: (i - 1) * 1.6, o: clamp(s * 1.6) * (1 - q), y: -q * 40 });
    });
    playHead(this.hl, t, 6.0, 9.2);
  },
};

export const enryo = {
  id: 'enryo', start: 9.5, end: 13, pre: 0.4, post: 0.6,
  build(el) {
    el.innerHTML = `
      <div class="abs ja kanji" style="left:150px;top:560px;font-weight:700;font-size:250px;line-height:1;color:#E6E0D0">遠慮</div>
      <div class="abs mono kl" style="left:162px;top:830px;font-size:20px;letter-spacing:.2em;color:var(--control)">ENRYO · HOLDING BACK</div>
      <div class="card msg" style="left:1110px;top:520px;width:640px;padding:30px 32px 28px">
        <div class="row">${avatar(TANAKA, 60)}<div><div class="plabel" style="font-size:22px">Tanaka-san</div><div class="psub" style="font-size:18px">New message to a neighbour</div></div></div>
        <div class="field" style="margin-top:22px;min-height:120px;font-size:27px"><span class="tx"></span></div>
        <div class="row" style="margin-top:20px;justify-content:flex-end"><div class="btn" style="width:170px;height:60px;font-size:21px;opacity:.35">${icon('send', 22, '#fff')} Send</div></div>
      </div>
      ${headline(`${words('Asking can feel like')}<br><span class="warm">${words('a burden.')}</span>`, { x: 150, y: 150, size: 92, w: 900 })}`;
    this.kanji = el.querySelector('.kanji'); this.kl = el.querySelector('.kl'); this.msg = el.querySelector('.msg'); this.tx = el.querySelector('.tx'); this.hl = el.querySelector('.hl');
  },
  update(lt, t) {
    enter(this.msg, t, 9.5, { dy: 60, out: 12.7, outDy: 40 });
    typeText(this.tx, 'Could someone help me carry rice up…', t, 9.8, 26, { del: 11.6, delCps: 40 });
    const ko = seg(t, 10.4, 11.2) * (1 - seg(t, 12.6, 13.2));
    this.kanji.style.opacity = ko.toFixed(3); this.kl.style.opacity = ko.toFixed(3);
    playHead(this.hl, t, 9.7, 12.7);
  },
};

export const helpers = {
  id: 'helpers', start: 13, end: 17.5, post: 0.4,
  build(el) {
    el.innerHTML = headline(`${words('The helpers')}<br>${words('already live here.')}`, { x: 150, y: 700, size: 96, w: 1000 }) +
      headline(`${words('Nothing')} <span class="warm">${words('connects them.')}</span>`, { x: 150, y: 820, size: 96, w: 1300, cls: 'h2' });
    [this.h1, this.h2] = el.querySelectorAll('.hl');
  },
  update(lt, t) { playHead(this.h1, t, 13.3, 15.1); playHead(this.h2, t, 15.4, 17.3); },
};

const TAGLINES = [['Help is close by.', 'sans', 'word'], ['助け合いは、すぐそばに。', 'ja', 'char'], ['সাহায্য আছে কাছেই।', 'bn', 'word']];
export const turn = {
  id: 'turn', start: 17.5, end: 25, post: 0.8,
  build(el) {
    el.innerHTML = `
      <div class="abs wm" style="white-space:nowrap"><div class="serif wmt" style="font-size:230px;line-height:1;color:var(--action)">${words('Otagai')}</div></div>
      <div class="abs sub" style="white-space:nowrap">
        <div class="row" style="gap:22px"><span class="ja st1" style="font-size:44px;color:var(--ink)">お互い</span><span class="st2" style="font:400 36px var(--serif);color:var(--secondary)">“mutual”</span></div>
        <div class="tl" style="position:relative;height:80px;margin-top:22px;width:900px">
          ${TAGLINES.map(([s, f, m]) => `<div class="tg headline ${f === 'sans' ? '' : f}" style="position:absolute;left:0;top:0;font-size:60px;${f === 'ja' ? 'font-weight:700;' : ''}">${glyphs(s, m)}</div>`).join('')}
        </div>
        <div class="row langs" style="gap:12px;margin-top:20px">${['English', '日本語', 'বাংলা'].map((l, i) => `<span class="chip lg ${i === 1 ? 'ja' : i === 2 ? 'bn' : ''}" style="height:44px;font-size:20px;background:#fff;box-shadow:0 0 0 1.5px var(--rule) inset;color:var(--ink)">${l}</span>`).join('')}</div>
      </div>`;
    this.wm = el.querySelector('.wm'); this.wmt = el.querySelector('.wmt'); this.sub = el.querySelector('.sub');
    this.st1 = el.querySelector('.st1'); this.st2 = el.querySelector('.st2');
    this.tg = [...el.querySelectorAll('.tg')]; this.lg = [...el.querySelectorAll('.lg')];
  },
  update(lt, t, ctx) {
    ctx.place(this.wm, 140, 247.5, { zref: 0.86, ax: 0.5, ay: 1 });
    ctx.place(this.sub, 140, 252, { zref: 0.86, ax: 0.5, ay: 0 });
    riseWords(this.wmt, t, 18.5, { preset: 'heavy', dist: 1.0 });
    const p1 = spring(t - 19.4, 'default'), p2 = spring(t - 19.6, 'default');
    css(this.st1, { y: (1 - p1) * 30, o: clamp(p1 * 1.5) });
    css(this.st2, { y: (1 - p2) * 30, o: clamp(p2 * 1.5) });
    const T = [20.4, 22.0, 23.2];
    this.tg.forEach((g, i) => {
      const tin = T[i], tout = T[i + 1] ?? 99;
      g.style.display = t > tin - 0.1 && t < tout + 0.6 ? '' : 'none';
      g.querySelectorAll('.g').forEach((s, j) => {
        const p = spring(t - tin - j * (i === 1 ? 0.025 : 0.06), 'snappy');
        const q = easeIn(seg(t, tout + j * 0.012, tout + 0.25 + j * 0.012));
        s.style.transform = `translateY(${((1 - p) * 0.35 - q * 0.3).toFixed(3)}em) scale(${(0.3 + 0.7 * p - q * 0.6).toFixed(3)})`;
        s.style.opacity = (clamp(p * 1.6) * (1 - q)).toFixed(3);
      });
    });
    this.lg.forEach((l, i) => {
      const p = spring(t - (20.6 + i * 0.12), 'snappy');
      const on = (i === 0 && t < 22.0) || (i === 1 && t >= 22.0 && t < 23.2) || (i === 2 && t >= 23.2);
      css(l, { o: clamp(p * 1.5), y: (1 - p) * 14 });
      l.style.background = on ? 'var(--wash)' : '#fff';
      l.style.boxShadow = on ? '0 0 0 2px var(--action) inset' : '0 0 0 1.5px var(--rule) inset';
    });
    const o = 1 - seg(t, 24.4, 25.1);
    this.wm.style.opacity = o.toFixed(3); this.sub.style.opacity = o.toFixed(3);
  },
};
