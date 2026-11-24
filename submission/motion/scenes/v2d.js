import { headline, playHead, typeText, words, riseWords } from './kit.js';
import { rel, devAt, zoomRig, zoomState, focusOn, swap, taps, tapRingHTML, press, show, setText, cls, trans, spring, seg, clamp, lerp, easeIn, easeOut, easeInOut, track, css } from './kit2.js';
import { screen, device, head, btn, field, choice, notice, listRow, avatarImg, avatarInit, sf, T, backRow, toggle } from '../lib/app.js';
import { glyphs, icon } from '../lib/ui.js';
import { KNOT_T, T_ALERT } from './world2.js';

const TANAKA = 'assets/onboarding-tanaka.png';
const RAHIM = 'assets/onboarding-rahim.png';
const CIRCLE = 'Mizunoura 3-chōme';

function measure(scene, root, map) {
  if (scene._m) return scene._m;
  const forced = [];
  for (const key in map) {
    let n = map[key];
    while (n && n !== root) { if (n.style && n.style.display === 'none') { forced.push(n); n.style.display = ''; } n = n.parentElement; }
  }
  const out = {};
  for (const key in map) out[key] = focusOn(map[key].__d, map[key]);
  forced.forEach((n) => (n.style.display = 'none'));
  scene._m = out;
  return out;
}
const F = (dev, node) => { node.__d = dev; return node; };
const tap1 = (d) => { d.querySelector('.dev-in').insertAdjacentHTML('beforeend', tapRingHTML); return d.querySelector('.tapr'); };
const sel = (title, sub, on, c = '') => `<div class="row ${c}" style="gap:14px;padding:14px 16px;border-radius:8px;box-shadow:0 0 0 ${on ? '1.5px var(--action)' : '1px var(--control)'} inset;background:${on ? 'var(--wash)' : '#fff'}"><span class="mk" style="width:22px;height:22px;border-radius:11px;box-shadow:0 0 0 ${on ? '7px var(--action)' : '1.5px var(--control)'} inset;flex:none"></span><div style="flex:1"><div style="${T.label}">${title}</div><div style="${T.sup}">${sub}</div></div></div>`;
const selOff = (title, sub) => `<div class="row" style="gap:14px;padding:14px 16px;border-radius:8px;box-shadow:0 0 0 1px var(--rule) inset;background:var(--paper)"><span style="width:22px;height:22px;border-radius:11px;box-shadow:0 0 0 1.5px var(--rule) inset;flex:none"></span><div style="flex:1"><div style="${T.label};color:var(--secondary)">${title}</div><div style="${T.sup}">${sub}</div></div></div>`;
function setSel(node, on) {
  if (node._on === on) return;
  node._on = on;
  node.style.boxShadow = `0 0 0 ${on ? '1.5px var(--action)' : '1px var(--control)'} inset`;
  node.style.background = on ? 'var(--wash)' : '#fff';
  node.querySelector('.mk').style.boxShadow = `0 0 0 ${on ? '7px var(--action)' : '1.5px var(--control)'} inset`;
}

export const thank = {
  id: 'thank', start: 95, end: 105, pre: 0.3, post: 0.8,
  build(el) {
    const ty = screen(`
      ${backRow()}${head({ title: 'Thank Tanaka-san', sub: 'Loan: Hammer drill' })}
      <div style="display:flex;flex-direction:column;gap:10px">${sel('Send a note', 'A private thank-you to Tanaka-san', false, 's0')}${selOff('Bring a small gift', 'Gift option unavailable in this version.')}${selOff('Send a small orei', 'Payments are unavailable in this version.')}</div>
      <div class="nf">${field('Suggested note · Editable', '<span class="nt"></span>', { min: 104 })}</div>
      <div class="a-notice"><div style="${T.label}">A fitting orei to bring in person</div><div style="${T.sup}">A small box of sweets, about ¥500.</div></div>`, { footer: btn('Send thank-you', 'primary', { cls: 'snd' }) });
    const sent = screen(`${backRow()}${head({ title: 'Thank-you sent', sub: 'Your note was shared privately with Tanaka-san.' })}<div class="a-notice"><div style="${T.label}">To Tanaka-san</div><div style="${T.body}">Thank you for taking the time to help me. I really appreciate it.</div></div>`, { footer: btn('View exchange') });
    const prof = screen(`
      ${backRow()}${head({ title: 'Rahim', sub: 'Speaks Bengali, English, Japanese' })}
      <div class="row tiles" style="gap:12px">${['You helped Rahim', 'Rahim helped you'].map((l, i) => `<div style="flex:1;background:var(--wash);border-radius:8px;padding:12px"><div class="cn${i}" style="font:400 34px/40px var(--serif);color:var(--action)">0</div><div style="${T.sup}">${l}</div></div>`).join('')}</div>
      <div style="${T.section}">Your shared history</div>
      ${[['Lent Hammer drill', 'Lender · Sat'], ['Help carrying rice', 'Helper · Thu'], ['Garden weeding', 'Helper · Tue'], ['Japanese forms', 'Helper · Mon']].map(([a, b], i) => `<div class="hr" style="padding:8px 0;box-shadow:0 -1px 0 var(--rule) inset"><div style="${T.label}">${a}</div><div style="${T.sup}">${b}</div></div>`).join('')}`, { tab: 'Home' });
    el.innerHTML = `<div class="rig">${device(ty + sent, { cls: 'dR' })}${device(prof, { cls: 'dT' })}
      <div class="abs stars" style="left:140px;top:230px;display:flex;gap:14px">${Array.from({ length: 5 }, () => `<span class="sx">${icon('star', 56, '#C6CBBE', 2)}</span>`).join('')}</div>
      <div class="abs strike" style="left:130px;top:258px;height:5px;width:0;background:var(--clay);border-radius:3px"></div>
      ${headline(`${words('No stars.')}<br><span class="em">${words('Only thank-yous.')}</span>`, { x: 140, y: 330, size: 66, w: 520, eyebrow: '08 — Thank' })}
      ${headline(`${words('Help goes')}<br><span class="em">${words('both ways.')}</span>`, { x: 140, y: 330, size: 66, w: 520, cls: 'h2' })}</div>`;
    this.rig = el.querySelector('.rig');
    [this.dR, this.dT] = el.querySelectorAll('.dev');
    this.tapR = tap1(this.dR);
    this.sc = [...this.dR.querySelectorAll('.a-scr')];
    this.s0 = this.dR.querySelector('.s0'); this.nt = this.dR.querySelector('.nt'); this.nf = F(this.dR, this.dR.querySelector('.nf')); this.snd = this.dR.querySelector('.snd');
    this.tiles = F(this.dT, this.dT.querySelector('.tiles')); this.cn0 = this.dT.querySelector('.cn0'); this.cn1 = this.dT.querySelector('.cn1');
    this.hr = [...this.dT.querySelectorAll('.hr')];
    this.stars = [...el.querySelectorAll('.sx')]; this.strike = el.querySelector('.strike');
    [this.h1, this.h2] = el.querySelectorAll('.hl');
    this.el = el;
  },
  update(lt, t) {
    trans(this.el, t, { tin: 94.7, kin: 'whipL', din: 0.6, tout: 104.6, kout: 'drop', dout: 0.6 });
    devAt(this.dR, 900);
    devAt(this.dT, 1340);
    const b = spring(t - 99.4, 'heavy');
    this.dT.style.transform = `translateY(${((1 - b) * 900).toFixed(1)}px)`;
    this.dT.style.display = t > 99.3 ? '' : 'none';
    const m = measure(this, this.rig, { nf: this.nf, tiles: this.tiles });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [96.1, [...m.nf, 1.45]], [98.4, [960, 540, 1]], [100.2, [...m.tiles, 1.5]], [102.8, [960, 540, 1]]]);
    swap(this.sc, t, [0, 99.0]);
    setSel(this.s0, t > 95.6);
    typeText(this.nt, 'Thank you for taking the time to help me. I really appreciate it.', t, 96.4, 42, { caret: t < 98.2 });
    press(this.snd, t, 98.7);
    taps(this.tapR, this.dR, t, [[95.6, this.s0], [98.7, this.snd]]);
    let a = 0, c = 0;
    for (let i = 0; i < 6; i++) if (t > KNOT_T(i)) (i % 2 ? c++ : a++);
    setText(this.cn0, String(a)); setText(this.cn1, String(c));
    this.hr.forEach((h, i) => show(h, t, 100.4 + i * 0.35, Infinity, { dy: 10 }));
    this.stars.forEach((s, i) => {
      const p = spring(t - 95.4 - i * 0.07, 'snappy'), q = easeIn(seg(t, 96.9 + i * 0.05, 97.4 + i * 0.05));
      css(s, { o: clamp(p * 1.5) * (1 - q * 0.8) * (1 - seg(t, 98.6, 99)), y: (1 - p) * 20 + q * 8 });
    });
    this.strike.style.width = (easeOut(seg(t, 96.5, 96.9)) * 360).toFixed(1) + 'px';
    this.strike.style.opacity = (1 - seg(t, 98.6, 99)).toFixed(3);
    playHead(this.h1, t, 95.8, 99.0);
    playHead(this.h2, t, 99.6, 104.4);
  },
};

const BN_REQ = 'ফার্মেসি থেকে আম্মুর ওষুধ এনে দিতে পারবেন?';
export const family = {
  id: 'family', start: 105, end: 115, pre: 0.3, post: 0.8,
  build(el) {
    const add = screen(`
      ${backRow()}${head({ title: 'Add a family member', sub: 'Ask their permission first. They can use Otagai through you even if they don’t have a phone.' })}
      ${field('Full name', '<span class="fn"></span>')}
      <div style="${T.label};color:var(--secondary)">Their language</div>${choice(['Japanese', 'English', 'Bengali'], -1, { cls: 'lng' })}
      <div style="${T.label};color:var(--secondary)">Where they live</div>${choice(['Japan', 'Bangladesh'], -1, { cls: 'rgn' })}
      <div style="${T.label};color:var(--secondary)">How will they give permission?</div>
      <div style="display:flex;flex-direction:column;gap:8px">${sel('In person', 'Review permissions together.', false)}${sel('On a call', 'Talk through permissions on a shared phone.', false, 'call')}</div>`, { footer: btn('Review permissions', 'primary', { cls: 'rv' }) });
    const perms = [['Post requests', 'Create and manage requests for Ammu.', 1], ['Send messages', 'Arrange help in Ammu’s name.', 1], ['Send thank-you payments', 'Send an optional thank-you after help.', 0], ['View activity', 'See requests, past help and thank-yous.', 1]];
    const rev = screen(`
      ${backRow()}${head({ title: 'Review permissions', sub: 'For Ammu · Cumilla, Bangladesh' })}
      <div class="pl" style="display:flex;flex-direction:column;gap:16px">${perms.map(([a, b, on]) => `<div class="row" style="gap:14px"><div style="flex:1"><div style="${T.label}">${a}</div><div style="${T.sup}">${b}</div></div><span class="tg" data-on="${on}">${toggle(false)}</span></div>`).join('')}</div>
      <div class="given a-notice" style="background:var(--wash)"><div style="${T.label};color:var(--action-deep)">Permission given ✓</div><div style="${T.sup}">Ammu can remove it at any time.</div></div>`, { footer: btn('Give permission', 'primary', { cls: 'gv' }) });
    const home = screen(`
      ${backRow().replace('Back', 'ফিরে যান')}${head({ title: '<span class="bn">আপনার পরিবার</span>', sub: '<span class="bn" style="font-size:17px">আপনার বিশ্বস্ত কাউকে দৈনন্দিন অনুরোধে সাহায্য করুন।</span>' })}
      <div class="row" style="gap:14px;padding:12px 14px;border-radius:8px;box-shadow:0 0 0 1px var(--rule) inset">${avatarImg(RAHIM, 48)}<div style="flex:1"><div style="${T.label}">Rahim</div><div class="bn" style="${T.sup};font-family:var(--bn)">আপনার অ্যাকাউন্ট</div></div></div>
      <div class="row" style="gap:14px;padding:12px 14px;border-radius:8px;box-shadow:0 0 0 1.5px var(--action) inset;background:var(--wash)">${avatarInit('A', 48, 'var(--clay-soft)', '#7D4A37')}<div style="flex:1"><div style="${T.label}">আম্মু · Ammu</div><div style="${T.sup}">Cumilla, Bangladesh</div></div><span style="${T.label};color:var(--action);font-family:var(--bn)">সক্রিয়</span></div>
      <div class="bn" style="${T.section};font-family:var(--bn)">আম্মু-এর খোলা অনুরোধ</div>
      <div class="a-card amr"><div class="bn" style="${T.body};font-family:var(--bn)">${BN_REQ}</div><div class="row" style="gap:8px"><span class="chip">${sf('people', 16)} বিল্ডিং সার্কেল</span><span class="chip clay ofr">১টি অফার</span></div></div>`, { lang: 'বাং' });
    el.innerHTML = `<div class="rig">${device(add + rev + home, { cls: 'dR' })}
      <div class="callout map" style="left:1430px;top:300px;width:420px;height:300px;padding:0;overflow:hidden">
        <svg width="420" height="300" viewBox="0 0 420 300"><path d="M0 230 Q 120 200 220 240 T 420 220" fill="none" stroke="#E2DFD3" stroke-width="2"/><path d="M0 260 Q 140 230 240 270 T 420 250" fill="none" stroke="#E2DFD3" stroke-width="2"/>
          <path class="arc" d="M330 120 Q 210 10 80 150" fill="none" stroke="#537257" stroke-width="4" stroke-linecap="round" stroke-dasharray="400" stroke-dashoffset="400"/>
          <circle cx="330" cy="120" r="9" fill="#537257"/><circle cx="80" cy="150" r="9" fill="#AA6A52"/><circle class="mv" r="7" fill="#AA6A52"/></svg>
        <div class="abs mono" style="left:270px;top:150px;font-size:15px;letter-spacing:.14em;color:var(--secondary)">NAGASAKI</div>
        <div class="abs mono" style="left:28px;top:180px;font-size:15px;letter-spacing:.14em;color:var(--clay)">CUMILLA</div></div>
      ${headline(`${words('With consent,')}<br><span class="em">${words('family can ask')}</span><br><span class="em">${words('for you.')}</span>`, { x: 140, y: 330, size: 70, w: 640, eyebrow: '09 — Family' })}</div>`;
    this.rig = el.querySelector('.rig'); this.dR = el.querySelector('.dev'); this.tap = tap1(this.dR);
    const q = (s) => this.dR.querySelector(s);
    this.sc = [...this.dR.querySelectorAll('.a-scr')];
    this.fn = q('.fn'); this.lng = [...this.dR.querySelectorAll('.lng .a-choice')]; this.rgn = [...this.dR.querySelectorAll('.rgn .a-choice')];
    this.call = q('.call'); this.rv = q('.rv'); this.tg = [...this.dR.querySelectorAll('.tg')]; this.pl = F(this.dR, q('.pl'));
    this.gv = q('.gv'); this.given = q('.given'); this.amr = q('.amr'); this.ofr = q('.ofr');
    this.map = el.querySelector('.map'); this.arc = el.querySelector('.arc'); this.mv = el.querySelector('.mv');
    this.hl = el.querySelector('.hl');
    this.el = el;
  },
  update(lt, t) {
    trans(this.el, t, { tin: 104.8, kin: 'rise', din: 0.9, tout: 114.6, kout: 'fade', dout: 0.5 });
    devAt(this.dR, 1060);
    const m = measure(this, this.rig, { pl: this.pl });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [108.6, [...m.pl, 1.4]], [110.6, [960, 540, 1]]]);
    swap(this.sc, t, [0, 108.4, 111.0]);
    typeText(this.fn, 'Ammu', t, 105.5, 14, { caret: t < 106.0 });
    this.lng.forEach((c, i) => cls(c, 'on', t > 106.1 && i === 2));
    this.rgn.forEach((c, i) => cls(c, 'on', t > 106.5 && i === 1));
    setSel(this.call, t > 107.3);
    press(this.rv, t, 108.0);
    this.tg.forEach((g, i) => {
      const on = g.dataset.on === '1' && t > 108.9 + i * 0.3;
      cls(g.firstElementChild, 'on', on);
    });
    press(this.gv, t, 110.2);
    show(this.given, t, 110.4, Infinity, { dy: 12 });
    taps(this.tap, this.dR, t, [[106.1, this.lng[2]], [106.5, this.rgn[1]], [107.3, this.call], [108.0, this.rv], [110.2, this.gv]]);
    show(this.ofr, t, 113.0, Infinity, { dy: 6, s0: 0.8, preset: 'snappy' });
    const mp = spring(t - 111.2, 'default'), mq = easeIn(seg(t, 114.3, 114.7));
    css(this.map, { o: clamp(mp * 1.5) * (1 - mq), x: (1 - mp) * 60 });
    this.map.style.display = t > 111.1 ? '' : 'none';
    const ap = easeInOut(seg(t, 111.6, 112.8));
    this.arc.setAttribute('stroke-dashoffset', (400 * (1 - ap)).toFixed(1));
    const mt = seg(t, 112.8, 113.8), mx = (1 - mt) ** 2 * 330 + 2 * (1 - mt) * mt * 210 + mt * mt * 80, my = (1 - mt) ** 2 * 120 + 2 * (1 - mt) * mt * 10 + mt * mt * 150;
    this.mv.setAttribute('cx', mx.toFixed(1)); this.mv.setAttribute('cy', my.toFixed(1));
    this.mv.setAttribute('opacity', (seg(t, 112.8, 112.9) * (1 - seg(t, 113.8, 114))).toFixed(2));
    playHead(this.hl, t, 105.6, 114.4);
  },
};

const JA_T = '木曜日9時〜12時 断水のお知らせ';
const JA_B = '水道管の点検のため、前の晩にお水をためておいてください。';
const BN_T = 'বৃহস্পতিবার ৯টা–১২টা পানি বন্ধ থাকবে';
const BN_B = 'পাইপ পরীক্ষার জন্য আগের রাতে পানি জমিয়ে রাখুন।';
const board = (title, body, lang, fam) => screen(`
  ${backRow()}${head({ eyebrow: CIRCLE, title: 'Circle board' })}
  <div style="display:flex;background:var(--paper);border-radius:10px;padding:4px">${['Notices', 'Events'].map((s, i) => `<div class="sgb" style="flex:1;text-align:center;padding:8px 0;border-radius:8px;${T.label};color:${i ? 'var(--secondary)' : 'var(--action)'};background:${i ? 'transparent' : 'var(--wash)'}">${s}</div>`).join('')}</div>
  <div class="a-card nc" style="gap:10px"><div class="row" style="gap:8px;${T.sup};color:var(--action)">${sf('pinned', 18, 'var(--action)')}Pinned · from Ito-san, circle leader</div>
    <div style="font:600 20px/28px var(${fam})">${title}</div><div style="font:400 17px/27px var(${fam});color:var(--ink)">${body}</div>
    ${lang ? `<div class="row" style="gap:6px;${T.sup};color:var(--action)">${sf('globe', 16, 'var(--action)')}${lang}</div>` : ''}</div>
  <div class="a-card"><div style="${T.sup}">Yesterday</div><div style="${T.label}">${fam === '--ja' ? 'ゴミの日は来週から金曜日です' : fam === '--bn' ? 'আগামী সপ্তাহ থেকে শুক্রবার আবর্জনা নেওয়া হবে' : 'Garbage day moves to Friday next week'}</div></div>`, { tab: 'Home' });
export const circle = {
  id: 'circle', start: 115, end: 125, pre: 0.3, post: 0.4,
  build(el) {
    const ev = screen(`
      ${backRow()}${head({ eyebrow: CIRCLE, title: 'Circle board' })}
      <div style="display:flex;background:var(--paper);border-radius:10px;padding:4px">${['Notices', 'Events'].map((s, i) => `<div style="flex:1;text-align:center;padding:8px 0;border-radius:8px;${T.label};color:${i ? 'var(--action)' : 'var(--secondary)'};background:${i ? 'var(--wash)' : 'transparent'}">${s}</div>`).join('')}</div>
      <div class="a-card evc" style="gap:10px">
        <div style="${T.card}">Cleaning day</div>
        <div class="row" style="gap:8px;${T.sup}">${sf('cal', 18, 'var(--secondary)')}Sun 8:00–10:00 · Community hall</div>
        <div style="height:8px;border-radius:4px;background:var(--paper);overflow:hidden"><div class="bar" style="height:100%;width:60%;background:var(--action);border-radius:4px"></div></div>
        <div class="cnt" style="${T.sup}">12 of 20 signed up</div>
        ${[['Sweep the stairs', '4 of 6'], ['Carry rubbish bags', '3 of 4'], ['Lend tools · rakes × 4', '2 lent']].map(([a, b]) => `<div class="row" style="justify-content:space-between;padding:6px 0;box-shadow:0 -1px 0 var(--rule) inset"><span style="${T.label}">${a}</span><span style="${T.sup}">${b}</span></div>`).join('')}
      </div>`, { tab: 'Home', footer: btn('Sign up', 'primary', { cls: 'su' }) });
    el.innerHTML = `<div class="rig">${device(board(JA_T, JA_B, '', '--ja') + ev, { cls: 'dT' })}${device(board(BN_T, BN_B, 'Translated from Japanese', '--bn'), { cls: 'dR' })}
      <div class="callout gloss" style="left:1010px;top:70px;${T.label};font-size:20px;padding:14px 20px;white-space:nowrap">${sf('globe', 20, 'var(--action)')}<span style="margin-left:10px">“Water off Thursday, 9–12”</span></div>
      ${headline(`${words('One notice board.')}<br><span class="em">${words('Every language.')}</span>`, { x: 140, y: 330, size: 60, w: 560, eyebrow: '10 — Circle life' })}
      ${headline(`${words('Cleaning days,')}<br><span class="em">${words('sign-ups and tools.')}</span>`, { x: 140, y: 330, size: 60, w: 560, cls: 'h2', eyebrow: 'Events' })}</div>`;
    this.rig = el.querySelector('.rig');
    [this.dT, this.dR] = el.querySelectorAll('.dev');
    this.tap = tap1(this.dT);
    this.sc = [...this.dT.querySelectorAll('.a-scr')];
    this.su = this.dT.querySelector('.su'); this.bar = this.dT.querySelector('.bar'); this.cnt = this.dT.querySelector('.cnt');
    this.nc = F(this.dR, this.dR.querySelector('.nc'));
    this.gloss = el.querySelector('.gloss');
    [this.h1, this.h2] = el.querySelectorAll('.hl');
    this.el = el;
  },
  update(lt, t) {
    trans(this.el, t, { tin: 114.8, kin: 'flood', din: 0.9, ox: 1100, oy: 540, tout: 125.0, kout: 'none', dout: 0.25 });
    const mv = easeInOut(seg(t, 119.4, 120.2));
    devAt(this.dT, lerp(900, 1200, mv));
    devAt(this.dR, 1340);
    const rq = easeIn(seg(t, 119.2, 119.8));
    this.dR.style.transform = `translateY(${(rq * 1000).toFixed(1)}px)`;
    this.dR.style.display = t < 119.9 ? '' : 'none';
    const m = measure(this, this.rig, { nc: this.nc });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [116.4, [m.nc[0] - 220, m.nc[1], 1.25]], [118.8, [960, 540, 1]]]);
    swap(this.sc, t, [0, 120.0]);
    press(this.su, t, 121.8);
    setText(this.su.querySelector('.bl'), t > 121.9 ? 'You’re signed up ✓' : 'Sign up');
    this.bar.style.width = `${lerp(60, 65, easeOut(seg(t, 121.9, 122.4)))}%`;
    setText(this.cnt, t > 121.9 ? '13 of 20 signed up' : '12 of 20 signed up');
    taps(this.tap, this.dT, t, [[121.8, this.su]]);
    const g = spring(t - 116.6, 'snappy'), gq = easeIn(seg(t, 119.0, 119.4));
    css(this.gloss, { o: clamp(g * 1.5) * (1 - gq), y: (1 - g) * 14 });
    this.gloss.style.display = t > 116.5 && t < 119.5 ? 'flex' : 'none';
    playHead(this.h1, t, 115.6, 119.6);
    playHead(this.h2, t, 120.2, 124.6);
  },
};

export const disaster = {
  id: 'disaster', start: 125, end: 140, pre: 0.1, post: 0.8,
  build(el) {
    const send = screen(`
      ${backRow()}${head({ title: 'Safety alert', sub: `${CIRCLE} · 46 members` })}
      <div style="${T.label};color:var(--secondary)">Level</div>
      <div class="lvl" style="display:flex;gap:8px">${['Info', 'Warning', 'Emergency'].map((l) => `<div class="a-choice lv">${l}</div>`).join('')}</div>
      ${field('Title', 'Heavy rain: evacuation advisory')}
      ${field('Message', 'Please check in. If you need help moving, tap “I need help”.', { min: 104 })}`, { footer: btn('Send alert to 46 members', 'danger', { cls: 'sa' }) });
    const list = screen(`
      ${head({ title: 'Check-ins', sub: 'Heavy rain: evacuation advisory' })}
      <div class="row" style="gap:8px">${[['Safe', 'var(--wash)', 'var(--action)', 'k0'], ['Need help', 'var(--clay-soft)', 'var(--clay)', 'k1'], ['No reply', 'var(--paper)', 'var(--secondary)', 'k2']].map(([l, bg, fg, c]) => `<div style="flex:1;background:${bg};border-radius:8px;padding:10px 12px"><div class="${c}" style="font:600 30px/36px var(--sans);color:${fg}">0</div><div style="${T.sup};font-size:15px">${l}</div></div>`).join('')}</div>
      <div style="${T.label};color:var(--clay)">Needs help first</div>
      <div class="nh" style="display:flex;flex-direction:column;gap:8px">
        ${[['Sato-san', '“I can’t manage the stairs alone.”'], ['Yamada-san', '“Need help moving my husband.”']].map(([n, q]) => `<div class="row nhr" style="gap:12px;padding:12px;border-radius:8px;box-shadow:0 0 0 1.5px var(--clay) inset;background:#FCF6F2">${avatarInit(n[0], 40, 'var(--clay-soft)', '#7D4A37')}<div style="flex:1"><div style="${T.label}">${n}</div><div style="${T.sup}">${q}</div></div><span style="${T.label};color:var(--clay)">Call</span></div>`).join('')}</div>
      <div style="${T.label};color:var(--action)">Safe</div>
      ${[['Tanaka-san', 'Safe · 05:14', TANAKA], ['Rahim', '“I can help carry people down.”', RAHIM]].map(([n, q, im]) => `<div class="row sfr" style="gap:12px;padding:6px 0">${avatarImg(im, 40)}<div style="flex:1"><div style="${T.label}">${n}</div><div style="${T.sup}">${q}</div></div>${sf('ok', 22, 'var(--action)')}</div>`).join('')}`);
    const alertS = `<div class="a-scr" style="background:#fff">${'<div class="a-status"><span>5:12</span><span class="a-island"></span><span></span></div>'}
      <div style="background:var(--clay);color:#fff;padding:14px 20px;display:flex;align-items:center;gap:10px;${T.label};color:#fff">${sf('alert', 22, '#fff')}Emergency · ${CIRCLE}</div>
      <div class="a-content" style="padding:20px">
        <div style="${T.title}">Heavy rain: evacuation advisory</div>
        <div style="${T.body};color:var(--secondary)">Please check in. If you need help moving, tap “I need help”.</div>
        <div style="${T.section};margin-top:6px">Are you safe?</div>
        ${btn('I’m safe', 'primary', { cls: 'safe', style: 'min-height:64px;font-size:21px', ic: sf('ok', 24, '#fff') })}
        ${btn('I need help', 'outline', { style: 'min-height:64px;font-size:21px;color:var(--clay);box-shadow:0 0 0 2px var(--clay) inset', ic: sf('heart', 22, 'var(--clay)') })}
        ${field('Add a note (optional)', '', { ph: 'Anything your circle should know' })}
        <div class="thx a-notice" style="background:var(--wash)"><div style="${T.label};color:var(--action-deep)">Thank you. Your circle knows you’re safe.</div></div>
      </div></div>`;
    const gentle = screen(`
      ${backRow()}${head({ title: 'Gentle check-in', sub: 'If you’re quiet for a while, someone you trust says hello.' })}
      <div class="row" style="gap:14px;min-height:56px"><div style="flex:1;${T.label}">Gentle check-in</div><span class="gt">${toggle(false)}</span></div>
      <div style="${T.label};color:var(--secondary)">Say hello if I’m quiet for</div>${choice(['1 day', '3 days', '7 days'], 1)}
      <div style="${T.label};color:var(--secondary)">Who should say hello?</div>
      <div class="row" style="gap:14px;padding:12px 14px;border-radius:8px;box-shadow:0 0 0 1.5px var(--action) inset;background:var(--wash)">${avatarImg(RAHIM, 44)}<div style="flex:1"><div style="${T.label}">Rahim</div><div style="${T.sup}">Neighbour · 0.3 km</div></div>${sf('ok', 22, 'var(--action)')}</div>
      <div style="${T.sup}">Off by default. You choose who, and you can turn it off any time.</div>`);
    el.innerHTML = `<div class="abs flash" style="inset:0;background:#AA6A52;opacity:0"></div><div class="rig">${device(send + list, { cls: 'dL' })}${device(alertS + gentle, { cls: 'dM' })}
      ${headline(`${words('On the hardest day,')}<br><span class="warm">${words('the circle checks in.')}</span>`, { x: 140, y: 330, size: 58, w: 560, eyebrow: '11 — Disaster mode' })}
      ${headline(`${words('Gentle check-ins,')}<br><span class="em">${words('only if you choose.')}</span>`, { x: 140, y: 330, size: 58, w: 560, cls: 'h2', eyebrow: 'Watching over' })}</div>`;
    this.rig = el.querySelector('.rig'); this.flash = el.querySelector('.flash');
    [this.dL, this.dM] = el.querySelectorAll('.dev');
    this.tapL = tap1(this.dL); this.tapM = tap1(this.dM);
    this.scL = [...this.dL.querySelectorAll('.a-scr')]; this.scM = [...this.dM.querySelectorAll('.a-scr')];
    this.lv = [...this.dL.querySelectorAll('.lv')]; this.sa = F(this.dL, this.dL.querySelector('.sa')); this.lvl = F(this.dL, this.dL.querySelector('.lvl'));
    this.k = [0, 1, 2].map((i) => this.dL.querySelector('.k' + i)); this.nhr = [...this.dL.querySelectorAll('.nhr')]; this.sfr = [...this.dL.querySelectorAll('.sfr')];
    this.safe = F(this.dM, this.dM.querySelector('.safe')); this.thx = this.dM.querySelector('.thx'); this.gt = this.dM.querySelector('.gt');
    [this.h1, this.h2] = el.querySelectorAll('.hl');
    this.el = el;
  },
  update(lt, t) {
    trans(this.el, t, { tin: 124.9, kin: 'fade', din: 0.25, tout: 139.8, kout: 'fade', dout: 0.5 });
    this.flash.style.opacity = (seg(t, 124.9, 125.0) * (1 - seg(t, 125.0, 125.6)) * 0.35 + seg(t, 127.3, 127.35) * (1 - seg(t, 127.35, 127.9)) * 0.25).toFixed(3);
    devAt(this.dL, 1060);
    devAt(this.dM, 1530);
    const lr = spring(t - 124.9, 'heavy');
    this.dL.style.transform = `translateY(${((1 - lr) * 900).toFixed(1)}px)`;
    const mr = spring(t - 127.8, 'heavy');
    this.dM.style.transform = `translateY(${((1 - mr) * 900).toFixed(1)}px)`;
    this.dM.style.display = t > 127.7 ? '' : 'none';
    const m = measure(this, this.rig, { lvl: this.lvl, sa: this.sa, safe: this.safe });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [125.5, [m.lvl[0], m.lvl[1] + 80, 1.35]], [127.6, [960, 540, 1]], [129.0, [m.safe[0], m.safe[1] + 40, 1.4]], [130.8, [960, 540, 1]]]);
    this.lv.forEach((c, i) => {
      const on = t > 125.8 && i === 2;
      if (c._on !== on) { c._on = on; c.style.background = on ? 'var(--clay-soft)' : '#fff'; c.style.boxShadow = on ? '0 0 0 1.5px var(--clay) inset' : '0 0 0 1px var(--rule) inset'; c.style.color = on ? '#7D4A37' : 'var(--ink)'; }
    });
    press(this.sa, t, T_ALERT - 0.2);
    taps(this.tapL, this.dL, t, [[125.8, this.lv[2]], [T_ALERT - 0.2, this.sa]]);
    swap(this.scL, t, [0, 131.0]);
    const safeN = Math.round(lerp(0, 38, easeOut(seg(t, 131.0, 135.0))));
    setText(this.k[0], String(safeN)); setText(this.k[1], t > 131.3 ? '2' : '0'); setText(this.k[2], String(Math.max(6, 44 - safeN)));
    this.nhr.forEach((r, i) => show(r, t, 131.4 + i * 0.3, Infinity, { dy: 12 }));
    this.sfr.forEach((r, i) => show(r, t, 132.2 + i * 0.3, Infinity, { dy: 12 }));
    press(this.safe, t, 129.8);
    show(this.thx, t, 130.0, Infinity, { dy: 10 });
    taps(this.tapM, this.dM, t, [[129.8, this.safe], [135.6, this.gt]]);
    swap(this.scM, t, [0, 135.0]);
    cls(this.gt.firstElementChild, 'on', t > 135.6);
    playHead(this.h1, t, 125.8, 134.8);
    playHead(this.h2, t, 135.3, 139.6);
  },
};

const TRUST = [['sparkle', 'AI suggests.', 'People decide.'], ['lock', 'Contact details', 'stay private.'], ['flag', 'Report or block,', 'quietly.'], ['eye', 'Nothing is public', 'unless you opt in.']];
export const trust = {
  id: 'trust', start: 140, end: 152, pre: 0.2, post: 0.6,
  build(el) {
    const st = screen(`
      ${backRow()}${head({ title: 'Account settings' })}
      <div class="row" style="gap:14px;min-height:56px"><div style="flex:1"><div style="${T.label}">Show profile details</div><div style="${T.sup}">Neighbours see your name and skills only.</div></div><span class="pv">${toggle(true)}</span></div>
      <div style="${T.section}">Text size</div>
      <div class="ts" style="display:flex;gap:8px">${['100%', '125%', '150%'].map((l) => `<div class="a-choice tz">${l}</div>`).join('')}</div>
      <div style="${T.label};color:var(--secondary)">Preview</div>
      <div class="prev" style="font:400 18px/1.45 var(--sans);color:var(--ink);min-height:150px">Neighbours help each other with everyday things.</div>
      ${btn('Save text size', 'secondary')}`);
    el.innerHTML = `<div class="rig">${device(st, { cls: 'dS' })}
      ${TRUST.map(([ic, a, b], i) => `<div class="card tr hl" style="left:150px;top:${130 + i * 205}px;width:760px;height:180px;display:flex;align-items:center;gap:30px;padding:0 36px">
        <div style="width:90px;height:90px;border-radius:22px;background:var(--wash);display:flex;align-items:center;justify-content:center;flex:none">${icon(ic, 44, 'var(--action)', 2.2)}</div>
        <div class="headline" style="font-size:46px;line-height:1.12">${a}<br><span class="em">${b}</span></div></div>`).join('')}</div>`;
    this.rig = el.querySelector('.rig'); this.dS = el.querySelector('.dev'); this.tap = tap1(this.dS);
    this.cards = [...el.querySelectorAll('.tr')]; this.tz = [...this.dS.querySelectorAll('.tz')]; this.prev = F(this.dS, this.dS.querySelector('.prev')); this.pv = this.dS.querySelector('.pv');
    this.el = el;
  },
  update(lt, t) {
    trans(this.el, t, { tin: 139.9, kin: 'wipe', din: 0.8, tout: 151.4, kout: 'fade', dout: 0.6 });
    devAt(this.dS, 1460);
    const d = spring(t - 140.4, 'heavy'), dq = easeIn(seg(t, 151.0, 151.8));
    this.dS.style.transform = `translateY(${((1 - d) * 900 + dq * 1000).toFixed(1)}px)`;
    const m = measure(this, this.rig, { prev: this.prev });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [145.6, [m.prev[0] - 200, m.prev[1], 1.25]], [148.8, [960, 540, 1]]]);
    this.cards.forEach((c, i) => {
      const p = spring(t - (140.6 + i * 1.6), 'default'), q = easeIn(seg(t, 150.8 + i * 0.1, 151.4 + i * 0.1));
      css(c, { x: (1 - p) * -90, y: q * 60, o: clamp(p * 1.5) * (1 - q) });
    });
    const lvl = t > 147.0 ? 2 : t > 145.8 ? 1 : 0;
    this.tz.forEach((c, i) => cls(c, 'on', i === lvl));
    const fs = track(t, [[0, 18], [145.8, 22.5, 'snappy'], [147.0, 27, 'snappy']]);
    this.prev.style.fontSize = fs.toFixed(2) + 'px';
    cls(this.pv.firstElementChild, 'on', t < 143.4);
    taps(this.tap, this.dS, t, [[143.4, this.pv], [145.8, this.tz[1]], [147.0, this.tz[2]]]);
  },
};

const TAGL = [['Help is close by.', '', 'word'], ['助け合いは、すぐそばに。', 'ja', 'char'], ['সাহায্য আছে কাছেই।', 'bn', 'word']];
export const close = {
  id: 'close', start: 152, end: 171,
  build(el) {
    el.innerHTML = `
      <div class="abs cl" style="left:1010px;top:250px;width:860px">
        <div class="serif wm" style="font-size:190px;line-height:1;color:var(--action)">${words('Otagai')}</div>
        <div class="row sub" style="gap:22px;margin-top:18px"><span class="ja" style="font-size:42px;color:var(--ink)">お互い</span><span style="font:400 34px var(--serif);color:var(--secondary)">“mutual”</span></div>
        <div class="serif l1" style="font-size:50px;line-height:1.3;color:var(--ink);margin-top:50px">${words('Nagasaki already has the helpers.')}</div>
        <div class="serif l2" style="font-size:50px;line-height:1.3;color:var(--action)">${words('Otagai is the connection.')}</div>
        <div class="tl" style="position:relative;height:70px;margin-top:40px">${TAGL.map(([s, f, m]) => `<div class="tg headline ${f}" style="position:absolute;left:0;top:0;font-size:44px;color:var(--secondary);${f === 'ja' ? 'font-weight:700;' : ''}">${glyphs(s, m)}</div>`).join('')}</div>
      </div>`;
    this.wm = el.querySelector('.wm'); this.sub = el.querySelector('.sub'); this.l1 = el.querySelector('.l1'); this.l2 = el.querySelector('.l2');
    this.tg = [...el.querySelectorAll('.tg')];
  },
  update(lt, t) {
    riseWords(this.l1, t, 153.4, { stagger: 0.07 });
    riseWords(this.l2, t, 155.4, { stagger: 0.08 });
    riseWords(this.wm, t, 157.0, { preset: 'heavy' });
    const p = spring(t - 157.5, 'default');
    css(this.sub, { o: clamp(p * 1.5), y: (1 - p) * 20 });
    const Ts = [159.6, 161.8, 164.0];
    this.tg.forEach((g, i) => {
      const tin = Ts[i], tout = i < 2 ? Ts[i + 1] : 999;
      g.style.display = t > tin - 0.1 && t < tout + 0.5 ? '' : 'none';
      g.querySelectorAll('.g').forEach((s, j) => {
        const pp = spring(t - tin - j * (i === 1 ? 0.025 : 0.06), 'snappy');
        const q = easeIn(seg(t, tout + j * 0.012, tout + 0.25 + j * 0.012));
        s.style.transform = `translateY(${((1 - pp) * 0.35 - q * 0.3).toFixed(3)}em)`;
        s.style.opacity = (clamp(pp * 1.6) * (1 - q)).toFixed(3);
      });
    });
  },
};

const CLOCK = [
  [0.6, '06:40', 'Mizunoura, Nagasaki'], [13, '07:15', 'Mizunoura, Nagasaki'], [25, 'Mon 19:20', 'Rahim moves in'],
  [42.5, 'Thu 08:10', 'Tanaka-san’s home'], [62.5, 'Thu 17:30', 'After work'], [75, 'Fri 20:00', 'Rahim’s new shelf'],
  [85, 'Sat 10:00', 'Tanaka-san’s home'], [95, 'Sat 16:20', 'Mizunoura'], [105, 'Sun 09:00', 'Nagasaki → Cumilla'],
  [115, 'Mon 07:30', 'Circle board'], [125, 'Tue 05:12', 'Heavy rain warning'], [140, 'Built in', 'Otagai'],
];
export const hud = {
  id: 'hud', start: 0, end: 171,
  build(el) {
    el.innerHTML = `<div class="abs clk mono halo" style="left:120px;top:64px;font-size:19px;letter-spacing:.16em;color:var(--control);text-transform:uppercase;display:flex;gap:16px;align-items:center">
      <span class="dot" style="width:12px;height:12px;border-radius:50%;background:var(--clay)"></span><span class="tm" style="color:var(--ink)"></span><span>·</span><span class="pl"></span></div>`;
    this.clk = el.querySelector('.clk'); this.tm = el.querySelector('.tm'); this.pl = el.querySelector('.pl'); this.dot = el.querySelector('.dot');
  },
  update(lt, t) {
    let i = -1;
    for (let k = 0; k < CLOCK.length; k++) if (t >= CLOCK[k][0]) i = k;
    const zs = zoomState.t === t ? zoomState.s : 1;
    this.clk.style.opacity = (i < 0 ? 0 : seg(t, 0.6, 1.2) * (1 - seg(t, 139.4, 140.0)) * clamp(1 - (zs - 1) / 0.15)).toFixed(3);
    if (i >= 0 && this.tm._i !== i) { this.tm._i = i; this.tm.textContent = CLOCK[i][1]; this.pl.textContent = CLOCK[i][2]; }
    if (i >= 0) {
      const p = spring(t - CLOCK[i][0], 'snappy');
      this.tm.style.display = 'inline-block';
      this.tm.style.transform = `translateY(${((1 - p) * 14).toFixed(2)}px)`;
      this.tm.style.opacity = clamp(p * 1.4).toFixed(3);
    }
    this.dot.style.opacity = t > 125 && t < 137 ? (0.5 + 0.5 * Math.sin(t * 7)).toFixed(3) : '1';
  },
};
