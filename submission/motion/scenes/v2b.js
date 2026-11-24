import { headline, playHead, typeText, words, riseWords } from './kit.js';
import { rel, devAt, zoomRig, focusOn, swap, sheet, scrim, taps, tapRingHTML, press, show, setText, setHTML, cls, trans, spring, seg, clamp, lerp, easeIn, easeOut, easeInOut, track, css } from './kit2.js';
import { screen, device, head, btn, field, choice, notice, card, listRow, avatarImg, avatarInit, sf, T, backRow } from '../lib/app.js';
import { P } from './world.js';
import { U, RINGS, ringR } from './world2.js';

const CIRCLE = 'Mizunoura 3-chōme';
const TANAKA = 'assets/onboarding-tanaka.png';
const RAHIM = 'assets/onboarding-rahim.png';
const JA_REQ = '階段の上までお米を運ぶのを手伝っていただけませんか？';

function measure(scene, root, map) {
  if (scene._m) return scene._m;
  const forced = [];
  for (const key in map) {
    let n = map[key];
    while (n && n !== root) { if (n.style && n.style.display === 'none') { forced.push([n, n.style.display]); n.style.display = ''; } n = n.parentElement; }
  }
  const out = {};
  for (const key in map) {
    const [dev, node] = map[key].__f;
    out[key] = focusOn(dev, node);
  }
  forced.forEach(([n, d]) => (n.style.display = d));
  scene._m = out;
  return out;
}
const F = (dev, node) => { node.__f = [dev, node]; return node; };

export const join = {
  id: 'join', start: 25, end: 35, pre: 0.6, post: 0.8,
  build(el) {
    const find = screen(`
      ${head({ title: 'Find your circle', sub: 'Join the people in your building or neighbourhood.' })}
      ${choice(['Invite code', 'Nearby'], 0, { cls: 'mode' })}
      <div class="a-notice" style="padding:16px;gap:12px">
        <div class="inv" style="display:flex;flex-direction:column;gap:12px">${field('Invite code', '', { ph: 'MZU-3K7Q' })}<div style="${T.sup}">Enter the code shared by your circle leader.</div>${btn('Scan a QR code', 'outline', { ic: sf('qr', 20, 'var(--action)') })}</div>
        <div class="near" style="display:none;flex-direction:column;gap:12px"><div style="${T.sup}">See circles within 3 km of your current location.</div>${btn('Use my location', 'primary', { cls: 'loc', ic: sf('pin', 20, '#fff') })}</div>
      </div>
      <div class="a-card match"><div style="${T.card}">${CIRCLE}</div><div style="${T.sup}">Japan · 0.4 km · 46 members</div>${btn('Request to join', 'primary', { cls: 'req' })}</div>
      <div style="${T.label};color:var(--action)">No circle nearby? Start one</div>`, { top: 'onb' });
    const wait = screen(`
      ${head({ title: 'Waiting for approval', sub: 'Your circle leader will review your request. You can close the app and check back later.' })}
      <div class="a-notice" style="padding:16px"><div style="${T.card}">${CIRCLE}</div><div class="pst" style="${T.sup};color:var(--action)">Pending approval</div></div>`, { top: 'onb', footer: btn('Check status') });
    const admin = screen(`
      ${backRow()}${head({ title: 'Manage circle', sub: CIRCLE })}
      <div style="${T.section}">Requests to join</div>
      <div class="row rq" style="gap:12px;min-height:54px"><div class="row" style="gap:12px;flex:1">${avatarImg(RAHIM, 44)}<div><div style="${T.label}">Rahim</div><div style="${T.sup}">Today · 0.3 km</div></div></div>${btn('Approve', 'primary', { cls: 'ap', style: 'min-height:44px;padding:0 14px;font-size:16px' })}${btn('Reject', 'outline', { style: 'min-height:44px;padding:0 12px;font-size:16px' })}</div>
      <div class="none" style="${T.sup};display:none">No one is waiting to join.</div>
      <div style="${T.section}">Members</div>
      <div class="row" style="gap:12px;min-height:48px">${avatarInit('I', 44)}<div style="flex:1"><div style="${T.label}">Ito-san</div><div style="${T.sup}">Leader</div></div></div>
      <div class="row" style="gap:12px;min-height:48px">${avatarImg(TANAKA, 44)}<div style="flex:1"><div style="${T.label}">Tanaka-san</div><div style="${T.sup}">Member</div></div><div style="${T.label};color:var(--action)">Remove</div></div>
      <div class="row newm" style="gap:12px;min-height:48px">${avatarImg(RAHIM, 44)}<div style="flex:1"><div style="${T.label}">Rahim</div><div style="${T.sup}">Member · just now</div></div></div>
      <div style="${T.section}">Invite codes</div>
      <div class="row" style="justify-content:space-between"><div><div style="${T.label}">MZU-3K7Q</div><div style="${T.sup}">3 of 10 used</div></div><div style="${T.label};color:var(--action)">Revoke</div></div>`);
    el.innerHTML = `<div class="rig">
      ${device(find + wait, { cls: 'dA' })}${device(admin, { cls: 'dB' })}
      ${headline(`${words('Join your circle.')}`, { x: 140, y: 330, size: 74, w: 620, eyebrow: '01 — Join' })}
      ${headline(`<span class="em">${words('Approved by')}</span><br><span class="em">${words('your circle leader.')}</span>`, { x: 140, y: 480, size: 60, w: 640, cls: 'h2' })}
    </div>`;
    this.rig = el.querySelector('.rig');
    [this.dA, this.dB] = el.querySelectorAll('.dev');
    this.dA.querySelector('.dev-in').insertAdjacentHTML('beforeend', tapRingHTML);
    this.dB.querySelector('.dev-in').insertAdjacentHTML('beforeend', tapRingHTML);
    [this.tapA] = this.dA.querySelectorAll('.tapr');
    [this.tapB] = this.dB.querySelectorAll('.tapr');
    this.sA = [...this.dA.querySelectorAll('.a-scr')];
    const q = (d, s) => d.querySelector(s);
    this.modes = [...this.dA.querySelectorAll('.mode .a-choice')];
    this.inv = q(this.dA, '.inv'); this.near = q(this.dA, '.near'); this.loc = q(this.dA, '.loc');
    this.match = q(this.dA, '.match'); this.req = F(this.dA, q(this.dA, '.req')); this.pst = q(this.dA, '.pst');
    this.rq = q(this.dB, '.rq'); this.ap = F(this.dB, q(this.dB, '.ap')); this.none = q(this.dB, '.none'); this.newm = q(this.dB, '.newm');
    [this.h1, this.h2] = el.querySelectorAll('.hl');
    this.el = el;
  },
  update(lt, t) {
    trans(this.el, t, { tin: 24.4, kin: 'fade', din: 0.6, tout: 35.0, kout: 'none' });
    const ax = track(t, [[0, 1060], [35.0, 1200, 'default']]);
    devAt(this.dA, ax);
    devAt(this.dB, 1530);
    const ar = spring(t - 24.5, 'heavy');
    this.dA.style.transform = `translateY(${((1 - ar) * 900).toFixed(1)}px)`;
    const br = spring(t - 29.9, 'heavy'), bq = easeIn(seg(t, 34.4, 35.0));
    this.dB.style.transform = `translateY(${((1 - br) * 900 + bq * 1000).toFixed(1)}px)`;
    this.dB.style.display = t > 29.8 ? '' : 'none';
    const m = measure(this, this.rig, { req: this.req, ap: this.ap });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [28.2, [...m.req, 1.6]], [29.8, [960, 540, 1]], [31.0, [...m.ap, 1.7]], [32.6, [960, 540, 1]]]);
    swap(this.sA, t, [0, 29.5]);
    const near = t > 26.4;
    this.modes.forEach((c, i) => cls(c, 'on', near ? i === 1 : i === 0));
    this.inv.style.display = near ? 'none' : 'flex';
    this.near.style.display = near ? 'flex' : 'none';
    press(this.loc, t, 27.2);
    show(this.match, t, 27.7, Infinity, { dy: 24 });
    press(this.req, t, 29.0);
    taps(this.tapA, this.dA, t, [[26.4, this.modes[1]], [27.2, this.loc], [29.0, this.req]]);
    press(this.ap, t, 31.6);
    taps(this.tapB, this.dB, t, [[31.6, this.ap]]);
    const gone = t > 31.9;
    this.rq.style.display = gone ? 'none' : 'flex';
    this.none.style.display = gone ? '' : 'none';
    show(this.newm, t, 32.0, Infinity, { dy: 14 });
    const ok = t > 32.4;
    setText(this.pst, ok ? 'Approved ✓  Welcome to the circle' : 'Pending approval');
    playHead(this.h1, t, 25.6, 34.6);
    playHead(this.h2, t, 26.6, 34.6);
  },
};

export const explore = {
  id: 'explore', start: 35, end: 42.5, pre: 0.2, post: 0.6,
  build(el) {
    const rows = [
      { img: 'assets/home-drill.png', title: 'Hammer drill', sub: 'Tools · Tanaka-san', right: 'Available', k: 'tool' },
      { img: 'assets/home-grass-cutter.png', title: 'Grass cutter', sub: 'Garden · Sato-san', right: 'Available', k: 'tool' },
      { img: TANAKA, title: 'Carrying shopping', sub: 'Skill · Tanaka-san', right: 'Available to help', k: 'skill', round: true },
      { img: '', title: 'Japanese forms', sub: 'Skill · Ito-san', right: 'Available to help', k: 'skill' },
    ];
    const browse = screen(`
      ${head({ title: 'Explore your circle', action: `<span style="${T.label};color:var(--action);padding:8px 14px;border-radius:20px;box-shadow:0 0 0 1px var(--rule) inset">+ Add listing</span>` })}
      ${field('Search tools or skills', '', { ph: 'Search your circle' })}
      <div class="seg" style="display:flex;background:var(--paper);border-radius:10px;padding:4px">${['All', 'Tools', 'Skills'].map((s, i) => `<div class="sg" style="flex:1;text-align:center;padding:8px 0;border-radius:8px;${T.label};color:var(--secondary)">${s}</div>`).join('')}</div>
      <div style="display:flex;gap:8px;overflow:hidden">${['Garden', 'Kitchen', 'Moving', 'Repairs'].map((c) => `<span style="height:44px;display:flex;align-items:center;padding:0 14px;border-radius:24px;box-shadow:0 0 0 1px var(--rule) inset;${T.label};color:var(--secondary);white-space:nowrap">${c}</span>`).join('')}</div>
      <div class="lst" style="display:flex;flex-direction:column;gap:4px">${rows.map((r) => `<div class="lr" data-k="${r.k}">${listRow(r)}</div>`).join('')}</div>`, { tab: 'Browse' });
    const prof = screen(`
      ${backRow()}${head({ title: 'Tanaka-san', sub: 'Speaks Japanese' })}
      <div class="row" style="gap:14px">${avatarImg(TANAKA, 64)}<div style="flex:1"><div style="${T.label}">About</div><div style="${T.sup}">Lives at the top of the Mizunoura steps. Loves her garden.</div></div></div>
      <div class="happy a-notice" style="background:var(--wash);padding:16px"><div style="${T.label}">Happy to help with</div><div style="${T.body}">Gardening, carrying shopping, Japanese forms</div></div>
      ${listRow({ img: 'assets/home-drill.png', title: 'Hammer drill', sub: 'Available to borrow', right: 'View listing' })}
      <div class="row" style="gap:12px">${['You helped Tanaka-san', 'Tanaka-san helped you'].map((l) => `<div style="flex:1;background:var(--wash);border-radius:8px;padding:12px"><div style="font:400 30px/38px var(--serif);color:var(--action)">0</div><div style="${T.sup}">${l}</div></div>`).join('')}</div>`, { tab: 'Browse' });
    el.innerHTML = `<div class="rig">${device(browse + prof, { cls: 'dA' })}
      ${headline(`${words('Explore')}<br>${words('your circle.')}`, { x: 140, y: 330, size: 74, w: 620, eyebrow: '02 — Explore' })}
      ${headline(`<span class="em">${words('Tools to borrow.')}</span><br><span class="em">${words('Neighbours happy to help.')}</span>`, { x: 140, y: 560, size: 46, w: 700, cls: 'h2' })}</div>`;
    this.rig = el.querySelector('.rig'); this.dA = el.querySelector('.dev');
    this.dA.querySelector('.dev-in').insertAdjacentHTML('beforeend', tapRingHTML);
    this.tap = this.dA.querySelector('.tapr');
    this.sc = [...this.dA.querySelectorAll('.a-scr')];
    this.sg = [...this.dA.querySelectorAll('.sg')];
    this.lr = [...this.dA.querySelectorAll('.lr')];
    this.happy = F(this.dA, this.dA.querySelector('.happy'));
    [this.h1, this.h2] = el.querySelectorAll('.hl');
    this.el = el;
  },
  update(lt, t) {
    trans(this.el, t, { tin: 34.8, kin: 'none', tout: 42.2, kout: 'whipL', dout: 0.6 });
    devAt(this.dA, 1200);
    const m = measure(this, this.rig, { happy: this.happy });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [39.4, [m.happy[0] - 60, m.happy[1] + 40, 1.55]], [41.8, [960, 540, 1]]]);
    swap(this.sc, t, [0, 38.6]);
    const skills = t > 36.8;
    this.sg.forEach((s, i) => { const on = skills ? i === 2 : i === 0; s.style.background = on ? 'var(--wash)' : 'transparent'; s.style.color = on ? 'var(--action)' : 'var(--secondary)'; });
    this.lr.forEach((r) => {
      const tool = r.dataset.k === 'tool';
      const p = tool ? 1 - easeInOut(seg(t, 36.9, 37.3)) : 1;
      r.style.display = tool && p < 0.01 ? 'none' : '';
      r.style.opacity = p.toFixed(3);
    });
    taps(this.tap, this.dA, t, [[36.8, this.sg[2]], [38.3, this.lr[2]]]);
    playHead(this.h1, t, 35.4, 42.0);
    playHead(this.h2, t, 36.4, 42.0);
  },
};

export const ask = {
  id: 'ask', start: 42.5, end: 62.5, pre: 0.5, post: 0.8,
  build(el) {
    const askScr = screen(`
      <div class="row" style="justify-content:space-between"><div style="${T.label}">Ask</div><div style="width:48px;height:48px;border-radius:24px;display:flex;align-items:center;justify-content:center;color:var(--action)">${sf('history', 22, 'var(--action)')}</div></div>
      <div class="empty" style="display:flex;flex-direction:column;gap:8px;padding-top:12px">
        <div style="${T.section}">What do you need?</div>
        <div style="${T.body};color:var(--secondary)">Find a tool, ask a neighbour for help, or show us what you’re working on.</div>
        <div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px;margin-top:12px">${['Find a drill for concrete', 'Help carrying a sofa'].map((c) => `<span style="border-radius:20px;box-shadow:0 0 0 1px var(--rule) inset;padding:10px 14px;${T.sup};color:var(--action)">${c}</span>`).join('')}</div>
      </div>
      <div class="convo" style="display:flex;flex-direction:column;gap:12px">
        <div class="ubub ub1">Rice up the steps, Saturday.</div>
        <div class="row think" style="gap:10px;${T.sup}"><span class="spin" style="width:18px;height:18px;border-radius:50%;border:2.5px solid var(--wash);border-top-color:var(--action)"></span>Checking your circle…</div>
        <div class="reply" style="${T.body};max-width:94%">No one has offered this yet. I drafted a polite request you can review.</div>
        <div class="draft" style="background:var(--paper);border-radius:14px;box-shadow:0 0 0 1px var(--rule) inset;overflow:hidden">
          <div class="row" style="gap:12px;padding:12px">${sf('doc', 22, 'var(--action)')}<div><div style="${T.sup}">Draft request</div><div style="${T.label}">Help carrying rice up the steps</div></div></div>
          <div style="display:flex;flex-direction:column;gap:8px;padding:0 12px 12px">
            <div class="ja jt" style="font:400 17px/27px var(--ja);color:var(--ink);min-height:54px"></div>
            <div class="en" style="${T.sup};font-size:15px">“Could someone help me carry rice up the steps?”</div>
            <div style="${T.label};color:var(--secondary)">Saturday morning</div>
            ${btn('Review request', 'primary', { cls: 'rev', style: 'font-size:16px' })}
          </div>
        </div>
      </div>`, {
      tab: 'Ask',
      footer: `<div style="border-radius:20px;box-shadow:0 0 0 1px var(--rule) inset;padding:4px;background:#fff">
        <div class="cin" style="min-height:48px;padding:9px 12px;${T.body};color:var(--secondary)">Describe what you need…</div>
        <div class="crec row" style="gap:8px;padding:12px;display:none"><span style="width:8px;height:8px;border-radius:4px;background:var(--clay)"></span><span style="${T.sup};color:var(--ink)">Recording…</span><span class="wv" style="display:flex;gap:3px;align-items:center;margin-left:8px">${Array.from({ length: 16 }, () => '<i style="display:block;width:3px;border-radius:2px;background:var(--clay)"></i>').join('')}</span></div>
        <div class="row" style="gap:2px"><span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;color:var(--action)">${sf('photo', 22, 'var(--action)')}</span><span class="mic" style="width:48px;height:48px;border-radius:24px;display:flex;align-items:center;justify-content:center;color:var(--action)">${sf('mic', 22, 'var(--action)')}</span><span style="flex:1"></span><span class="snd" style="width:48px;height:48px;border-radius:24px;background:var(--action);display:flex;align-items:center;justify-content:center;opacity:.45">${sf('up', 22, '#fff', 2.4)}</span></div></div>`,
    });
    const sheetHTML = `<div class="scrim" style="position:absolute;inset:0;background:#303630;opacity:0"></div>
      <div class="sheet" style="position:absolute;left:0;right:0;top:56px;bottom:0;background:#fff;border-radius:20px 20px 0 0;display:flex;flex-direction:column;box-shadow:0 -10px 30px rgba(0,0,0,.08)">
        <div class="row" style="justify-content:space-between;padding:8px 12px 8px 20px;border-bottom:1px solid var(--rule)"><div style="${T.section}">Review request</div><span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${sf('xmark', 20, 'var(--action)')}</span></div>
        <div style="padding:20px;display:flex;flex-direction:column;gap:12px;flex:1;min-height:0;overflow:hidden">
          <div style="background:var(--paper);border-radius:12px;padding:16px;display:flex;flex-direction:column;gap:5px"><div style="${T.label};color:var(--action)">Ask for help</div><div style="${T.card}">Help carrying rice up the steps</div><div style="${T.sup}">Send to · ${CIRCLE}</div></div>
          ${field('Request details', `<span class="ja" style="font:400 17px/27px var(--ja)">${JA_REQ}</span>`, { min: 80 })}
          ${field('When · optional', 'Saturday morning')}
          <div style="background:var(--paper);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px"><div style="${T.label}">Share up to</div>${choice(['Your circle', 'Association', 'Nearby within 3 km'], 0, { cls: 'scope' })}<div style="${T.sup};font-size:15px;line-height:22px">Starts with family and only reaches the groups you allow.</div></div>
        </div>
        <div class="row" style="flex:none;gap:8px;padding:12px 20px 20px;border-top:1px solid var(--rule)">${btn('Cancel', 'secondary', { style: 'font-size:16px' })}${btn('Post request', 'primary', { cls: 'post', style: 'flex:1;font-size:16px' })}</div>
      </div>`;
    const stages = ['Family', 'Your circle', 'Association', 'Nearby within 3 km'];
    const deliv = screen(`
      ${backRow()}${head({ title: 'Request delivery', sub: 'Open · Help carrying rice up the steps' })}
      <div style="border-radius:12px;box-shadow:0 0 0 1px var(--rule) inset;padding:16px">
        ${stages.map((s, i) => `<div class="row stg" style="gap:14px;min-height:65px;align-items:flex-start"><div style="width:20px;display:flex;flex-direction:column;align-items:center;align-self:stretch"><span class="sd" style="width:14px;height:14px;border-radius:7px;box-shadow:0 0 0 1.5px var(--control) inset;margin-top:5px;flex:none"></span>${i < 3 ? '<span style="flex:1;width:1px;background:var(--rule)"></span>' : ''}</div><div><div style="${T.label}">${s}</div><div class="ss" style="${T.sup}">Scheduled</div></div></div>`).join('')}
      </div>
      <div style="${T.sup}">Next update · Today 10:30<br>Request expires · Sunday</div>
      <div style="${T.label};color:var(--action)">Refresh delivery</div>`, { tab: 'Requests' });
    el.innerHTML = `<div class="rig">
      ${device(askScr + deliv + sheetHTML, { cls: 'dA' })}
      <div class="callout cnote row" style="left:1430px;top:610px;gap:12px;${T.label};font-size:22px;color:var(--action-deep)">${sf('shield', 26, 'var(--action)')}Only shared when you post.</div>
      <div class="abs fly" style="width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;background:var(--action);box-shadow:0 0 0 10px rgba(83,114,87,.16);display:none"></div>
      ${headline(`${words('Say it simply.')}`, { x: 140, y: 330, size: 74, w: 640, eyebrow: '03 — Ask' })}
      ${headline(`<span class="em">${words('Otagai writes it')}</span><br><span class="em">${words('politely.')}</span>`, { x: 140, y: 480, size: 74, w: 640, cls: 'h2' })}
      ${headline(`${words('Starts with family.')}<br><span class="em">${words('Widens, gently.')}</span>`, { x: 140, y: 790, size: 70, w: 900, cls: 'h3', eyebrow: '04 — Ripple' })}
      ${headline(`${words('No reply is a')} <span class="em">${words('quiet no.')}</span>`, { x: 140, y: 840, size: 70, w: 1000, cls: 'h4', eyebrow: 'Nobody is told' })}
    </div>
    ${RINGS.map((r) => `<div class="abs rl chip" style="background:#fff;box-shadow:0 8px 22px rgba(48,54,48,.12);font-size:21px;height:44px">${r.label}</div>`).join('')}`;
    this.rig = el.querySelector('.rig'); this.dA = el.querySelector('.dev');
    const inner = this.dA.querySelector('.dev-in');
    inner.insertAdjacentHTML('beforeend', tapRingHTML);
    this.tap = inner.querySelector('.tapr');
    const q = (s) => this.dA.querySelector(s);
    this.sc = [...this.dA.querySelectorAll('.a-scr')];
    this.empty = q('.empty'); this.ub1 = q('.ub1'); this.think = q('.think'); this.reply = q('.reply'); this.draft = F(this.dA, q('.draft'));
    this.jt = q('.jt'); this.en = q('.en'); this.rev = q('.rev'); this.cin = q('.cin'); this.crec = q('.crec'); this.wv = [...this.dA.querySelectorAll('.wv i')];
    this.mic = F(this.dA, q('.mic')); this.snd = q('.snd'); this.spin = q('.spin');
    this.scrimEl = q('.scrim'); this.sheetEl = q('.sheet'); this.postBtn = F(this.dA, q('.post'));
    this.scopes = [...this.sheetEl.querySelectorAll('.scope .a-choice')];
    this.stg = [...this.dA.querySelectorAll('.stg')];
    this.cnote = el.querySelector('.cnote'); this.fly = el.querySelector('.fly');
    this.rl = [...el.querySelectorAll('.rl')];
    [this.h1, this.h2, this.h3, this.h4] = el.querySelectorAll('.hl');
    this.el = el;
  },
  update(lt, t, ctx) {
    trans(this.el, t, { tin: 42.2, kin: 'whipR', din: 0.65, tout: 62.4, kout: 'none' });
    const dx = track(t, [[0, 1150], [54.2, 1500, 'default']]);
    devAt(this.dA, dx);
    const dq = easeIn(seg(t, 62.2, 62.9));
    this.dA.style.transform = `translateY(${(dq * 1000).toFixed(1)}px)`;
    const m = measure(this, this.rig, { mic: this.mic, draft: this.draft, postBtn: this.postBtn });
    const comp = [m.mic[0] + 100, m.mic[1] - 30];
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [43.0, [...comp, 1.65]], [45.6, [960, 540, 1]], [46.9, [m.draft[0], m.draft[1] - 20, 1.45]], [48.8, [960, 540, 1]], [50.8, [m.postBtn[0], m.postBtn[1] - 165, 1.4]], [53.8, [960, 540, 1]]]);
    swap(this.sc, t, [0, 54.3]);
    const rec = t > 43.3 && t < 44.9;
    this.cin.style.display = rec ? 'none' : '';
    this.crec.style.display = rec ? 'flex' : 'none';
    this.wv.forEach((w, i) => { w.style.height = (5 + 18 * Math.abs(Math.sin(t * 9 + i * 1.3) * 0.6 + Math.sin(t * 4.1 + i) * 0.4)).toFixed(1) + 'px'; });
    this.mic.style.background = rec ? 'var(--clay-soft)' : 'transparent';
    setText(this.cin, t > 44.9 && t < 45.5 ? 'Transcribing…' : 'Describe what you need…');
    taps(this.tap, this.dA, t, [[43.2, this.mic], [44.8, this.mic], [49.0, this.rev], [51.4, this.scopes[2]], [53.2, this.postBtn]]);
    const conv = t > 45.5;
    this.empty.style.display = conv ? 'none' : 'flex';
    show(this.ub1, t, 45.5, Infinity, { dy: 16 });
    show(this.think, t, 45.75, 46.55, { dy: 8 });
    this.spin.style.transform = `rotate(${(t * 400) % 360}deg)`;
    show(this.reply, t, 46.7, Infinity, { dy: 12 });
    show(this.draft, t, 46.9, Infinity, { dy: 24 });
    typeText(this.jt, JA_REQ, t, 47.1, 18, { caret: t < 48.7 });
    this.en.style.opacity = seg(t, 48.4, 48.8).toFixed(3);
    press(this.rev, t, 49.0);
    scrim(this.scrimEl, t, 49.1, 53.5);
    sheet(this.sheetEl, t, 49.1, 53.5);
    this.scopes.forEach((choice, i) => cls(choice, 'on', i === (t >= 51.4 ? 2 : 0)));
    press(this.postBtn, t, 53.2);
    const cn = spring(t - 50.5, 'snappy'), cq = easeIn(seg(t, 53.6, 54.0));
    css(this.cnote, { o: clamp(cn * 1.5) * (1 - cq), y: (1 - cn) * 20, s: 0.9 + 0.1 * cn });
    this.cnote.style.display = t > 50.4 && t < 54.1 ? 'flex' : 'none';
    if (t > 53.3 && t < 55.9 && ctx.pen) {
      const p = easeInOut(seg(t, 53.3, 54.2));
      const pb = m.postBtn;
      const [px, py] = ctx.pen;
      const x = lerp(pb[0], px, p), y = lerp(pb[1], py, p) - Math.sin(p * Math.PI) * 160;
      this.fly.style.display = '';
      this.fly.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${(1 + 0.4 * Math.sin(t * 8) * seg(t, 54.2, 55.6)).toFixed(3)})`;
      this.fly.style.opacity = (1 - seg(t, 55.5, 55.9)).toFixed(3);
    } else this.fly.style.display = 'none';
    this.stg.forEach((row, j) => {
      const hit = t > RINGS[j].t + 0.3, next = !hit && (j === 0 || t > RINGS[j - 1].t + 0.3);
      const k = hit ? 2 : next ? 1 : 0;
      if (row._k !== k) {
        row._k = k;
        const d = row.querySelector('.sd');
        d.style.background = k === 2 ? 'var(--action)' : k === 1 ? 'var(--wash)' : 'transparent';
        d.style.boxShadow = k === 2 ? 'none' : k === 1 ? '0 0 0 3px var(--action) inset' : '0 0 0 1.5px var(--control) inset';
      }
      const n = hit ? Math.round(lerp(0, [2, 5, 9, 12][j], easeOut(seg(t, RINGS[j].t + 0.3, RINGS[j].t + 1.2)))) : 0;
      setText(row.querySelector('.ss'), hit ? `${n} delivered to inbox` : next ? 'Waiting' : 'Scheduled');
    });
    const c = P(U.junction), ang = (-150 * Math.PI) / 180;
    this.rl.forEach((l, j) => {
      const r = ringR(j, t), p = spring(t - RINGS[j].t - 0.4, 'snappy');
      const o = clamp(p * 1.5) * (1 - seg(t, 62.0, 62.6));
      l.style.display = o > 0.002 ? '' : 'none';
      if (o > 0.002) ctx.place(l, c[0] + Math.cos(ang) * r, c[1] + Math.sin(ang) * r, { zref: ctx.cam.z, s: 0.7 + 0.3 * p });
      l.style.opacity = o.toFixed(3);
    });
    playHead(this.h1, t, 43.1, 54.0);
    playHead(this.h2, t, 46.9, 54.0);
    playHead(this.h3, t, 55.5, 59.4);
    playHead(this.h4, t, 59.8, 62.3);
  },
};
