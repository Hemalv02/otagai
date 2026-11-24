import { headline, playHead, typeText, words, morph } from './kit.js';
import { rel, devAt, zoomRig, focusOn, swap, taps, tapRingHTML, press, show, setText, cls, trans, spring, seg, clamp, lerp, easeIn, easeOut, easeInOut, track, css } from './kit2.js';
import { screen, device, head, btn, field, choice, notice, listRow, avatarImg, avatarInit, sf, T, backRow, checkbox, pill } from '../lib/app.js';
import { glyphs } from '../lib/ui.js';
import { P } from './world.js';
import { U, T_OFFER } from './world2.js';

const TANAKA = 'assets/onboarding-tanaka.png';
const RAHIM = 'assets/onboarding-rahim.png';
const JA_REQ = '階段の上までお米を運ぶのを手伝っていただけませんか？';
const BN_REQ = 'সিঁড়ি দিয়ে চালের বস্তা তুলতে কেউ কি সাহায্য করবেন?';
const JA_REP = '仕事のあとならお手伝いできます。';
const BN_REP = 'কাজের পর আমি সাহায্য করতে পারব।';

function measure(scene, root, map) {
  if (scene._m) return scene._m;
  const forced = [];
  for (const key in map) {
    let n = map[key];
    while (n && n !== root) { if (n.style && n.style.display === 'none') { forced.push([n, 'none']); n.style.display = ''; } n = n.parentElement; }
  }
  const out = {};
  for (const key in map) out[key] = focusOn(map[key].__d, map[key]);
  forced.forEach(([n, d]) => (n.style.display = d));
  scene._m = out;
  return out;
}
const F = (dev, node) => { node.__d = dev; return node; };
const chatTop = (name, img) => `<div class="row" style="gap:10px;height:60px;padding:0 16px;border-bottom:1px solid var(--rule);flex:none">${sf('back', 22, 'var(--action)', 2.4)}${avatarImg(img, 36)}<div style="${T.label}">${name}</div></div>`;

export const meet = {
  id: 'meet', start: 62.5, end: 75, pre: 0.2, post: 0.8,
  build(el) {
    const chat = `<div class="a-scr" style="background:#fff">${'<div class="a-status"><span>9:41</span><span class="a-island"></span><span></span></div>'}${chatTop('Rahim', RAHIM)}
      <div style="flex:1;padding:16px;display:flex;flex-direction:column;gap:10px;justify-content:flex-end">
        <div style="${T.sup};text-align:center">Contact details stay private. Use this chat to arrange the help.</div>
        <div class="obub ja" style="font-family:var(--ja);font-size:17px;line-height:27px">${JA_REQ}</div>
        <div class="pbub prep" style="position:relative;min-height:60px"><div class="from bn">${glyphs(BN_REP, 'word')}</div><div class="to ja" style="position:absolute;left:14px;top:10px;right:14px;font-size:17px">${glyphs(JA_REP, 'char')}</div></div>
        <div class="row pv" style="gap:6px;${T.label};font-size:15px;color:var(--action)">${sf('globe', 16, 'var(--action)')}Preview translation</div>
      </div>
      <div class="row" style="gap:8px;padding:10px 16px 30px"><div style="flex:1;border-radius:20px;box-shadow:0 0 0 1px var(--rule) inset;padding:10px 16px;${T.body};color:var(--control)">Write a message…</div><span style="width:48px;height:48px;border-radius:24px;background:var(--action);display:flex;align-items:center;justify-content:center">${sf('up', 22, '#fff', 2.4)}</span></div></div>`;
    const req = screen(`
      ${backRow()}${head({ title: 'Requests', sub: 'Open' })}
      <div class="a-card rcard">
        <div style="${T.sup}">Requested by · Tanaka-san</div>
        <div class="rtx" style="position:relative;min-height:84px;font:400 18px/28px var(--sans)"><div class="from ja" style="font-family:var(--ja)">${glyphs(JA_REQ, 'char')}</div><div class="to bn" style="position:absolute;inset:0">${glyphs(BN_REQ, 'word')}</div></div>
        <div style="${T.sup}">Saturday morning · 0.3 km</div>
        <div class="tr" style="${T.label};color:var(--action)">Translate</div>
      </div>
      ${btn('Ask a question', 'secondary')}${btn('Suggest a time', 'secondary')}
      <div class="sent a-notice"><div style="${T.label}">Response sent</div><div style="${T.sup}">Tanaka-san will see your offer.</div></div>`, { footer: btn('I can help', 'primary', { cls: 'help' }), tab: 'Requests' });
    const rchat = `<div class="a-scr" style="background:#fff"><div class="a-status"><span>9:41</span><span class="a-island"></span><span></span></div>${chatTop('Tanaka-san', TANAKA)}
      <div style="flex:1;padding:16px;display:flex;flex-direction:column;gap:10px;justify-content:flex-end">
        <div class="pbub bn" style="font-size:17px">${BN_REQ}</div>
        <div class="obub bn myrep" style="font-size:17px">${BN_REP}</div>
      </div>
      <div class="row" style="gap:8px;padding:10px 16px 30px"><div style="flex:1;border-radius:20px;box-shadow:0 0 0 1px var(--rule) inset;padding:10px 16px;${T.body};color:var(--control)">Write a message…</div><span style="width:48px;height:48px;border-radius:24px;background:var(--action);display:flex;align-items:center;justify-content:center">${sf('up', 22, '#fff', 2.4)}</span></div></div>`;
    el.innerHTML = `<div class="rig">
      ${device(chat, { cls: 'dT' })}${device(req + rchat, { cls: 'dR' })}
      <div class="abs ret" style="width:18px;height:18px;margin:-9px 0 0 -9px;border-radius:50%;background:var(--clay);box-shadow:0 0 0 8px rgba(170,106,82,.18);display:none"></div>
      <div class="print photo" style="left:250px;top:150px;width:880px;height:720px"><img src="assets/onboarding-nagasaki.jpg"><div class="cap">One morning in Nagasaki</div></div>
      ${headline(`${words('Read it in')}<br><span class="em">${words('your language.')}</span>`, { x: 640, y: 120, size: 72, w: 700, eyebrow: '05 — Meet' })}
      ${headline(`${words('Then meet,')}<br><span class="em">${words('in person.')}</span>`, { x: 1230, y: 560, size: 92, w: 680, cls: 'h2' })}
    </div>`;
    this.rig = el.querySelector('.rig');
    [this.dT, this.dR] = el.querySelectorAll('.dev');
    for (const d of [this.dT, this.dR]) d.querySelector('.dev-in').insertAdjacentHTML('beforeend', tapRingHTML);
    this.tapR = this.dR.querySelector('.tapr');
    this.prep = F(this.dT, this.dT.querySelector('.prep')); this.pv = this.dT.querySelector('.pv');
    this.rcard = F(this.dR, this.dR.querySelector('.rcard')); this.rtx = this.dR.querySelector('.rtx'); this.tr = this.dR.querySelector('.tr');
    this.help = this.dR.querySelector('.help'); this.sent = this.dR.querySelector('.sent'); this.myrep = this.dR.querySelector('.myrep');
    this.rsc = [...this.dR.querySelectorAll('.a-scr')];
    this.ret = el.querySelector('.ret'); this.photo = el.querySelector('.photo');
    [this.h1, this.h2] = el.querySelectorAll('.hl');
    this.el = el;
  },
  update(lt, t, ctx) {
    trans(this.el, t, { tin: 62.3, kin: 'none', din: 0.3, tout: 74.6, kout: 'push', dout: 0.6, ox: 690, oy: 510 });
    const out = easeIn(seg(t, 69.4, 70.2));
    devAt(this.dT, 330 - out * 700);
    devAt(this.dR, 1590 + out * 700);
    const a = spring(t - 62.4, 'heavy'), b = spring(t - 62.7, 'heavy');
    this.dT.style.transform = `translateY(${((1 - a) * 900).toFixed(1)}px)`;
    this.dR.style.transform = `translateY(${((1 - b) * 900).toFixed(1)}px)`;
    const m = measure(this, this.rig, { prep: this.prep, rcard: this.rcard });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [64.0, [m.rcard[0] - 40, m.rcard[1], 1.45]], [65.8, [960, 540, 1]], [67.7, [m.prep[0] + 30, m.prep[1], 1.45]], [69.3, [960, 540, 1]]], { mode: 'fade' });
    morph(this.rtx, t, 64.3, { stagger: 0.02 });
    setText(this.tr, t > 64.3 ? 'Show original' : 'Translate');
    press(this.help, t, T_OFFER);
    setText(this.help.querySelector('.bl'), t > T_OFFER + 0.1 ? 'View exchange' : 'I can help');
    show(this.sent, t, T_OFFER + 0.2, Infinity, { dy: 14 });
    taps(this.tapR, this.dR, t, [[64.1, this.tr], [T_OFFER, this.help]]);
    swap(this.rsc, t, [0, 67.0]);
    show(this.myrep, t, 67.2, Infinity, { dy: 14 });
    if (t > 67.4 && t < 68.1) {
      const p = easeInOut(seg(t, 67.4, 68.1));
      const [sx, sy] = ctx.w2s(...P(lerp(U.rahim, U.junction, p)));
      this.ret.style.display = ''; this.ret.style.transform = `translate(${sx.toFixed(1)}px,${sy.toFixed(1)}px)`;
    } else this.ret.style.display = 'none';
    show(this.prep, t, 68.0, Infinity, { dy: 14 });
    morph(this.prep, t, 68.5, { stagger: 0.03 });
    this.pv.style.opacity = seg(t, 68.7, 69.0).toFixed(3);
    const pp = spring(t - 69.9, 'heavy');
    css(this.photo, { r: -1.4, s: 0.9 + 0.1 * pp + (t - 70) * 0.004, y: (1 - pp) * 60, o: clamp(pp * 1.4) });
    this.photo.style.display = t > 69.8 ? '' : 'none';
    playHead(this.h1, t, 63.2, 69.4);
    playHead(this.h2, t, 70.6, 74.5);
  },
};

export const rahimAsks = {
  id: 'rahimAsks', start: 75, end: 85, pre: 0.3, post: 0.8,
  build(el) {
    const opts = ['Concrete or brick', 'Wood or plasterboard', 'I’m not sure'];
    const s = screen(`
      <div class="row" style="justify-content:space-between"><div style="${T.label}">Ask</div><div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${sf('history', 22, 'var(--action)')}</div></div>
      <div style="flex:1;overflow:hidden;position:relative"><div class="convo" style="display:flex;flex-direction:column;gap:12px">
        <div class="ubub u1"><img src="assets/ask-shelf-wall.png" style="width:186px;height:124px;border-radius:10px;object-fit:cover">How do I put up a shelf here?</div>
        <div class="row think t1" style="gap:10px;${T.sup}"><span class="spin" style="width:18px;height:18px;border-radius:50%;border:2.5px solid var(--wash);border-top-color:var(--action)"></span>Checking your circle…</div>
        <div class="r1" style="display:flex;flex-direction:column;gap:8px"><div style="${T.label};color:var(--action)">A wall with shelf brackets</div><div style="${T.body}">What is the wall made of?</div><div style="${T.sup}">The wall material helps us suggest the right drill and bits.</div>
          <div class="opts" style="display:flex;flex-direction:column;gap:8px">${opts.map((o) => `<div class="a-choice op">${o}</div>`).join('')}</div></div>
        <div class="ubub u2">Concrete or brick</div>
        <div class="row think t2" style="gap:10px;${T.sup}"><span class="spin" style="width:18px;height:18px;border-radius:50%;border:2.5px solid var(--wash);border-top-color:var(--action)"></span>Checking your circle…</div>
        <div class="r2" style="display:flex;flex-direction:column;gap:4px"><div style="${T.label};color:var(--action)">Concrete wall</div><div style="${T.body}">A hammer drill can help. For a shelf on a concrete wall, look for masonry bits, suitable wall plugs and a level.</div></div>
        <div class="g1" style="display:flex;flex-direction:column;gap:8px"><div style="${T.label};color:var(--secondary)">Tools</div>
          <div class="row wid" style="background:#fff;border-radius:14px;box-shadow:0 0 0 1px var(--rule) inset;overflow:hidden"><div class="row" style="gap:12px;padding:12px;flex:1"><div style="width:46px;height:46px;border-radius:10px;overflow:hidden"><img src="assets/home-drill.png" style="width:100%;height:100%;object-fit:cover"></div><div style="flex:1"><div style="${T.label}">Hammer drill</div><div style="${T.sup}">Tanaka-san · Available</div></div>${sf('chev', 16, 'var(--action)')}</div><div class="bor" style="align-self:stretch;display:flex;align-items:center;padding:0 14px;box-shadow:1px 0 0 var(--rule) inset;${T.label};color:var(--action)">Borrow</div></div></div>
        <div class="g2" style="display:flex;flex-direction:column;gap:8px"><div style="${T.label};color:var(--secondary)">People who can help</div>
          <div class="row" style="background:#fff;border-radius:14px;box-shadow:0 0 0 1px var(--rule) inset;overflow:hidden"><div class="row" style="gap:12px;padding:12px;flex:1">${avatarInit('I', 46)}<div style="flex:1"><div style="${T.label}">Ito-san</div><div style="${T.sup}">Shelf fitting</div></div>${sf('chev', 16, 'var(--action)')}</div><div style="align-self:stretch;display:flex;align-items:center;padding:0 14px;box-shadow:1px 0 0 var(--rule) inset;${T.label};color:var(--action)">Ask</div></div></div>
        <div class="row posted" style="gap:12px;padding:12px;background:var(--paper);border-radius:12px">${sf('ok', 20, 'var(--action)')}<div style="flex:1"><div style="${T.label};color:var(--action)">Borrow request sent</div><div style="${T.sup}">Hammer drill</div></div>${sf('chev', 16, 'var(--action)')}</div>
      </div></div>`, {
      tab: 'Ask',
      footer: `<div style="border-radius:20px;box-shadow:0 0 0 1px var(--rule) inset;padding:4px"><div style="min-height:48px;padding:9px 12px;${T.body};color:var(--secondary)">Answer the follow-up…</div><div class="row"><span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${sf('photo', 22, 'var(--action)')}</span><span style="width:48px;height:48px;display:flex;align-items:center;justify-content:center">${sf('mic', 22, 'var(--action)')}</span><span style="flex:1"></span><span style="width:48px;height:48px;border-radius:24px;background:var(--action);opacity:.45;display:flex;align-items:center;justify-content:center">${sf('up', 22, '#fff', 2.4)}</span></div></div>`,
    });
    el.innerHTML = `<div class="rig">${device(s, { cls: 'dR' })}
      ${headline(`${words('No tool name?')}`, { x: 140, y: 330, size: 74, w: 640, eyebrow: '06 — Rahim asks' })}
      ${headline(`<span class="em">${words('Just show')}</span><br><span class="em">${words('the wall.')}</span>`, { x: 140, y: 480, size: 74, w: 640, cls: 'h2' })}</div>`;
    this.rig = el.querySelector('.rig'); this.dR = el.querySelector('.dev');
    this.dR.querySelector('.dev-in').insertAdjacentHTML('beforeend', tapRingHTML);
    this.tap = this.dR.querySelector('.tapr');
    const q = (s) => this.dR.querySelector(s);
    this.convo = q('.convo'); this.u1 = q('.u1'); this.t1 = q('.t1'); this.r1 = q('.r1'); this.op = [...this.dR.querySelectorAll('.op')];
    this.u2 = q('.u2'); this.t2 = q('.t2'); this.r2 = q('.r2'); this.g1 = q('.g1'); this.g2 = q('.g2'); this.posted = q('.posted');
    this.wid = F(this.dR, q('.wid')); this.opts = F(this.dR, q('.opts')); this.bor = q('.bor');
    this.spins = [...this.dR.querySelectorAll('.spin')];
    [this.h1, this.h2] = el.querySelectorAll('.hl');
    this.el = el;
  },
  update(lt, t) {
    trans(this.el, t, { tin: 74.7, kin: 'pull', din: 0.7, tout: 84.6, kout: 'flip', dout: 0.45, ox: 1200, oy: 540 });
    devAt(this.dR, 1200);
    show(this.u1, t, 75.5, Infinity, { dy: 16 });
    show(this.t1, t, 75.9, 76.7, { dy: 8 });
    show(this.r1, t, 76.8, Infinity, { dy: 14 });
    const sel = t > 78.6;
    this.op.forEach((o, i) => cls(o, 'on', sel && i === 0));
    show(this.u2, t, 79.0, Infinity, { dy: 14 });
    show(this.t2, t, 79.2, 79.9, { dy: 8 });
    show(this.r2, t, 80.0, Infinity, { dy: 14 });
    show(this.g1, t, 80.4, Infinity, { dy: 16 });
    show(this.g2, t, 80.7, Infinity, { dy: 16 });
    show(this.posted, t, 83.0, Infinity, { dy: 14 });
    this.spins.forEach((s) => (s.style.transform = `rotate(${(t * 400) % 360}deg)`));
    const scroll = track(t, [[0, 0], [79.1, 150, 'default'], [80.2, 470, 'default'], [83.1, 560, 'default']]);
    this.convo.style.transform = `translateY(${(-scroll).toFixed(1)}px)`;
    const m = measure(this, this.rig, { opts: this.opts, wid: this.wid });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [76.9, [m.opts[0], m.opts[1] - 150, 1.5]], [79.0, [960, 540, 1]], [80.6, [m.wid[0], m.wid[1] - 470 + 40, 1.55]], [83.4, [960, 540, 1]]]);
    press(this.bor, t, 82.6);
    taps(this.tap, this.dR, t, [[78.6, this.op[0]], [82.6, this.bor]]);
    playHead(this.h1, t, 75.6, 84.4);
    playHead(this.h2, t, 76.4, 84.4);
  },
};

const ITEMS = ['Hammer drill × 1', 'Battery × 1', 'Charger × 1', 'Masonry bits × 2'];
export const lend = {
  id: 'lend', start: 85, end: 95, pre: 0.3, post: 0.8,
  build(el) {
    const add = screen(`<div class="sc1" style="display:flex;flex-direction:column;gap:16px">
      ${backRow()}${head({ title: 'Add listing' })}
      ${choice(['Tool or item', 'Skill'], 0)}
      <div style="${T.label};color:var(--secondary)">Photo (optional)</div>
      <div class="pic" style="height:190px;border-radius:8px;overflow:hidden;background:var(--paper);position:relative"><img src="assets/home-drill.png" style="width:100%;height:100%;object-fit:cover"><div class="flash" style="position:absolute;inset:0;background:#fff;opacity:0"></div></div>
      <div class="row" style="gap:16px;${T.label};color:var(--action)"><span>Choose photo</span><span>Take photo</span><span>Suggest details</span></div>
      <div class="hint row" style="gap:8px;${T.sup}"><span class="spin" style="width:16px;height:16px;border-radius:50%;border:2.5px solid var(--wash);border-top-color:var(--action)"></span><span class="ht">Looking at your photo…</span></div>
      ${field('Name', '<span class="f1"></span>')}
      <div class="row" style="justify-content:space-between;min-height:48px;box-shadow:0 -1px 0 var(--rule) inset"><span style="${T.label}">Category</span><span class="f2" style="${T.body};color:var(--action)">Tools ›</span></div>
      ${field('Description', '<span class="f3"></span>', { min: 78 })}
      <div style="${T.label};color:var(--secondary)">Included parts</div>
      <div class="f4" style="display:flex;flex-wrap:wrap;gap:8px">${['Battery × 1', 'Charger × 1', 'Masonry bits × 2'].map((p) => `<span class="a-pill prt">${p}</span>`).join('')}</div></div>`, { footer: btn('Publish listing') });
    const pick = screen(`
      ${backRow()}${head({ eyebrow: 'Hammer drill', title: 'Pickup checklist', sub: 'Check what’s included, then both confirm the handover.' })}
      <div style="width:100%;aspect-ratio:1.8;border-radius:12px;overflow:hidden;background:var(--paper)"><img src="assets/pickup-drill.png" style="width:100%;height:100%;object-fit:cover"></div>
      <div style="${T.label}">Items to check</div>
      <div class="items" style="box-shadow:0 1px 0 var(--rule) inset">${ITEMS.map((it) => `<div class="row itm" style="gap:12px;padding:8px 0;box-shadow:0 -1px 0 var(--rule) inset">${checkbox(false, 'cb')}<div style="flex:1"><div style="${T.label}">${it}</div><div class="st" style="${T.sup}">To check</div></div><span style="${T.label};color:var(--action)">Edit</span></div>`).join('')}</div>
      <div class="row" style="gap:8px">${pill('You · <span class="c1">Waiting</span>', false, 'p1')}${pill('Your neighbour · <span class="c2">Waiting</span>', false, 'p2')}</div>`, { footer: btn('Confirm pickup', 'primary', { cls: 'cp' }) });
    el.innerHTML = `<div class="rig">${device(add + pick, { cls: 'dT' })}
      <div class="callout risky" style="left:1450px;top:250px;width:400px;display:flex;flex-direction:column;gap:12px">
        <div class="eyebrow" style="font-size:15px">If an item is risky</div>
        <div class="row" style="gap:10px;${T.label};font-size:19px">${sf('alert', 22, 'var(--clay)')}Category · Ladders</div>
        <div class="a-notice"><div style="${T.label}">Offered as help, not a loan</div><div style="${T.sup}">Items in this category are risky to lend. You’ll offer your help with it instead.</div></div></div>
      <div class="callout ext" style="left:1450px;top:250px;width:400px;display:flex;flex-direction:column;gap:12px">
        <div style="${T.section};font-size:22px">Need a little more time?</div>
        <div style="box-shadow:2px 0 0 var(--clay) inset;padding-left:14px;display:flex;flex-direction:column;gap:6px"><div style="${T.label}">Suggested message you can edit</div><div style="${T.body};font-size:17px;line-height:26px">Could I keep the drill one more day? I’ll bring it back on Monday morning.</div></div>
        <div style="${T.label};color:var(--action)">Ask for one more day</div></div>
      ${headline(`${words('A photo becomes')}<br><span class="em">${words('a listing.')}</span>`, { x: 140, y: 330, size: 74, w: 640, eyebrow: '07 — Lend' })}
      ${headline(`${words('Check the parts')}<br><span class="em">${words('together.')}</span>`, { x: 140, y: 330, size: 74, w: 640, cls: 'h2', eyebrow: 'Pickup' })}</div>`;
    this.rig = el.querySelector('.rig'); this.dT = el.querySelector('.dev');
    this.dT.querySelector('.dev-in').insertAdjacentHTML('beforeend', tapRingHTML);
    this.tap = this.dT.querySelector('.tapr');
    const q = (s) => this.dT.querySelector(s);
    this.sc = [...this.dT.querySelectorAll('.a-scr')]; this.sc1 = q('.sc1');
    this.pic = F(this.dT, q('.pic')); this.flash = q('.flash'); this.hint = q('.hint'); this.ht = q('.ht'); this.hspin = q('.spin');
    this.f1 = q('.f1'); this.f2 = q('.f2'); this.f3 = q('.f3'); this.prt = [...this.dT.querySelectorAll('.prt')];
    this.cb = [...this.dT.querySelectorAll('.cb')]; this.st = [...this.dT.querySelectorAll('.st')]; this.items = F(this.dT, q('.items'));
    this.p1 = q('.p1'); this.p2 = q('.p2'); this.c1 = q('.c1'); this.c2 = q('.c2'); this.cp = q('.cp');
    this.risky = el.querySelector('.risky'); this.ext = el.querySelector('.ext');
    [this.h1, this.h2] = el.querySelectorAll('.hl');
    this.el = el;
  },
  update(lt, t) {
    trans(this.el, t, { tin: 84.75, kin: 'flip', din: 0.5, tout: 94.6, kout: 'whipR', dout: 0.55, ox: 1200, oy: 540 });
    devAt(this.dT, 1200);
    const m = measure(this, this.rig, { pic: this.pic, items: this.items });
    zoomRig(this.rig, t, [[0, [960, 540, 1]], [85.5, [m.pic[0], m.pic[1] + 120, 1.4]], [88.2, [960, 540, 1]], [91.6, [...m.items, 1.45]], [93.8, [960, 540, 1]]]);
    swap(this.sc, t, [0, 90.9]);
    this.flash.style.opacity = (seg(t, 85.4, 85.45) * (1 - seg(t, 85.45, 85.9))).toFixed(3);
    const looking = t < 86.8;
    setText(this.ht, looking ? 'Looking at your photo…' : 'Suggestions fill empty fields. Your edits stay.');
    this.hspin.style.display = looking ? '' : 'none';
    this.hspin.style.transform = `rotate(${(t * 400) % 360}deg)`;
    typeText(this.f1, 'Hammer drill', t, 86.9, 26, { caret: false });
    this.f2.style.opacity = seg(t, 87.4, 87.7).toFixed(3);
    typeText(this.f3, 'Cordless hammer drill for concrete and brick.', t, 87.6, 50, { caret: false });
    this.prt.forEach((p, i) => show(p, t, 88.5 + i * 0.15, Infinity, { dy: 8, s0: 0.8, preset: 'snappy' }));
    const sc = track(t, [[0, 0], [87.2, 300, 'default']]);
    this.sc1.style.transform = `translateY(${(-sc).toFixed(1)}px)`;
    this.cb.forEach((c, i) => { const on = t > 91.9 + i * 0.4; cls(c, 'on', on); c.textContent = on ? '✓' : ''; setText(this.st[i], on ? 'Present' : 'To check'); });
    const y1 = t > 93.4, y2 = t > 93.8;
    cls(this.p1, 'on', y1); cls(this.p2, 'on', y2);
    setText(this.c1, y1 ? 'Confirmed' : 'Waiting'); setText(this.c2, y2 ? 'Confirmed' : 'Waiting');
    setText(this.cp.querySelector('.bl'), y2 ? 'Record pickup' : 'Confirm pickup');
    taps(this.tap, this.dT, t, [[85.4, this.pic], ...this.cb.map((c, i) => [91.9 + i * 0.4, c]), [93.4, this.cp]]);
    const r = spring(t - 88.6, 'default'), rq = easeIn(seg(t, 90.6, 91.0));
    css(this.risky, { o: clamp(r * 1.5) * (1 - rq), x: (1 - r) * 60 });
    this.risky.style.display = t > 88.5 && t < 91.1 ? 'flex' : 'none';
    const e = spring(t - 92.2, 'default'), eq = easeIn(seg(t, 94.4, 94.8));
    css(this.ext, { o: clamp(e * 1.5) * (1 - eq), x: (1 - e) * 60 });
    this.ext.style.display = t > 92.1 ? 'flex' : 'none';
    playHead(this.h1, t, 85.6, 90.6);
    playHead(this.h2, t, 91.2, 94.4);
  },
};
