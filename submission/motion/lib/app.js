import { icon } from './ui.js';

const SF = {
  chev: '<path d="M9 5l7 7-7 7"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  xmark: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  photo: '<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M20.5 16l-5-5-8 8"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  wrench: '<path d="M14.5 6.5a4 4 0 0 0 5 5L11 20a2.1 2.1 0 0 1-3-3l8.5-8.5"/><path d="M4 4l5 5M3 7l4-4"/>',
  doc: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>',
  ok: '<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="M8 12.5l2.7 2.7L16.5 9" stroke="#fff"/>',
  house: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  list: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  bubble: '<path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4V6a1 1 0 0 1 1-1z"/>',
  people: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  history: '<path d="M4 12a8 8 0 1 0 2.4-5.7L4 8.6"/><path d="M4 4v4.6h4.6M12 8v4.5l3 1.8"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  qr: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  alert: '<path d="M12 3.5l9.5 16.5h-19z"/><path d="M12 10v4.5M12 17.5v.2"/>',
  cal: '<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  pinned: '<path d="M9 3h6l-1 5 3 3v2H7v-2l3-3zM12 13v8"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5c-2.6-2.6-3.6-5.4-3.6-8.5s1-5.9 3.6-8.5z"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8.2-8 9-4.6-.8-8-4.5-8-9V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  textsize: '<path d="M4 18L9 6l5 12M5.8 14h6.4M15 18l3-7 3 7M16 16h4"/>',
};
export const sf = (n, size = 22, color = 'currentColor', sw = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">${SF[n] || ''}</svg>`;

export const T = {
  title: 'font:600 30px/38px var(--sans);letter-spacing:-0.4px;color:var(--ink)',
  section: 'font:600 24px/32px var(--sans);letter-spacing:-0.3px;color:var(--ink)',
  card: 'font:600 20px/28px var(--sans);color:var(--ink)',
  body: 'font:400 18px/28px var(--sans);color:var(--ink)',
  button: 'font:600 18px/26px var(--sans)',
  label: 'font:600 16px/24px var(--sans);color:var(--ink)',
  sup: 'font:400 16px/24px var(--sans);color:var(--secondary)',
};

export const statusBar = () => `<div class="a-status"><span>9:41</span><span class="a-island"></span><span style="display:flex;gap:6px;align-items:center"><svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="#303630"/><rect x="5" y="5" width="3" height="7" rx="1" fill="#303630"/><rect x="10" y="2" width="3" height="10" rx="1" fill="#303630"/><rect x="15" y="0" width="3" height="12" rx="1" fill="#303630"/></svg><svg width="26" height="13" viewBox="0 0 26 13"><rect x=".5" y=".5" width="22" height="12" rx="3.5" fill="none" stroke="#303630" opacity=".4"/><rect x="2.2" y="2.2" width="17" height="8.6" rx="2" fill="#303630"/></svg></span></div>`;

export const topBar = (lang = 'EN') =>
  `<div class="a-top"><span style="font:400 27px/35px var(--serif);color:var(--action)">Otagai</span><span style="display:flex;gap:18px;${T.label};color:var(--action)"><span>Settings</span><span>${lang}</span></span></div>`;

export const onbTop = () =>
  `<div class="a-top" style="border:none"><span class="row" style="gap:10px"><img src="assets/otagai-mark.png" style="width:36px;height:36px;border-radius:9px"><span style="font:400 27px/35px var(--serif);color:var(--action)">Otagai</span></span><span style="${T.label};color:var(--action)">Sign out</span></div>`;

export function tabBar(active) {
  const tabs = [['house', 'Home'], ['search', 'Browse'], ['list', 'Requests'], ['bubble', 'Ask']];
  return `<div class="a-tabs">${tabs.map(([ic, l]) => `<div class="a-tab ${l === active ? 'on' : ''}"><span class="a-tabic">${sf(ic, 24)}</span><span>${l}</span></div>`).join('')}</div>`;
}

export const backRow = () => `<div class="row" style="gap:6px;min-height:48px;${T.label};color:var(--action)">${sf('back', 20, 'var(--action)', 2.4)}Back</div>`;

export function head({ eyebrow, title, sub, compact, action } = {}) {
  return `<div style="display:flex;flex-direction:column;gap:8px">
    ${eyebrow ? `<div style="${T.label};color:var(--action)">${eyebrow}</div>` : ''}
    ${title ? `<div class="row" style="justify-content:space-between;gap:8px"><div style="${compact ? T.label : T.title}">${title}</div>${action || ''}</div>` : ''}
    ${sub ? `<div style="${T.body};color:var(--secondary)">${sub}</div>` : ''}</div>`;
}

export function btn(label, kind = 'primary', { cls = '', style = '', ic = '' } = {}) {
  const k = {
    primary: 'background:var(--action);color:#fff;min-height:52px',
    secondary: 'background:#fff;color:var(--ink);box-shadow:0 0 0 1px var(--rule) inset;min-height:52px',
    outline: 'background:#fff;color:var(--action);box-shadow:0 0 0 1px var(--control) inset;min-height:48px',
    text: 'background:transparent;color:var(--action);min-height:48px;justify-content:flex-start',
    danger: 'background:var(--clay);color:#fff;min-height:52px',
  }[kind];
  return `<div class="a-btn ${cls}" style="${k};${style}">${ic}<span class="bl">${label}</span></div>`;
}

export const field = (label, value = '', { cls = '', min = 48, hint = '', ph = '' } = {}) =>
  `<div style="display:flex;flex-direction:column;gap:8px"><div style="${T.label};color:var(--secondary)">${label}</div>
   <div class="a-field ${cls}" style="min-height:${min}px">${value || `<span style="color:var(--control)">${ph}</span>`}</div>
   ${hint ? `<div style="${T.sup}">${hint}</div>` : ''}</div>`;

export const choice = (opts, sel = 0, { cls = '', stacked = false } = {}) =>
  `<div class="${cls}" style="display:flex;${stacked ? 'flex-direction:column' : 'flex-wrap:wrap'};gap:8px">${opts.map((o, i) => `<div class="a-choice ${i === sel ? 'on' : ''}" data-i="${i}">${o}</div>`).join('')}</div>`;

export const notice = (title, detail, { cls = '', style = '' } = {}) =>
  `<div class="a-notice ${cls}" style="${style}"><div style="${T.label}">${title}</div>${detail ? `<div style="${T.sup}">${detail}</div>` : ''}</div>`;

export const card = (inner, { cls = '', style = '' } = {}) => `<div class="a-card ${cls}" style="${style}">${inner}</div>`;

export const listRow = ({ img, title, sub, right = '', cls = '', round = false }) =>
  `<div class="row ${cls}" style="gap:12px;min-height:64px">
    <div style="width:56px;height:56px;border-radius:${round ? 28 : 8}px;background:var(--paper);overflow:hidden;flex:none;display:flex;align-items:center;justify-content:center">${img ? `<img src="${img}" style="width:100%;height:100%;object-fit:cover">` : ''}</div>
    <div style="flex:1;min-width:0"><div style="${T.label}">${title}</div><div style="${T.sup}">${sub}</div></div>
    ${right ? `<div style="${T.sup};color:var(--action);max-width:30%;text-align:right">${right}</div>` : ''}</div>`;

export const toggle = (on, cls = '') => `<div class="a-toggle ${on ? 'on' : ''} ${cls}"><i></i></div>`;
export const checkbox = (on, cls = '') => `<div class="a-check ${on ? 'on' : ''} ${cls}">${on ? '✓' : ''}</div>`;
export const pill = (txt, on, cls = '') => `<div class="a-pill ${on ? 'on' : ''} ${cls}">${txt}</div>`;
export const avatarImg = (src, size = 56) => `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;background:var(--wash);flex:none"><img src="${src}" style="width:100%;height:100%;object-fit:cover"></div>`;
export const avatarInit = (ch, size = 56, bg = 'var(--wash)', fg = 'var(--action)') => `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:${fg};display:flex;align-items:center;justify-content:center;font:600 ${Math.round(size * 0.38)}px var(--sans);flex:none">${ch}</div>`;

export function screen(inner, { footer = '', tab = '', top = 'app', cls = '', lang = 'EN', bg = '#fff', pad = 20 } = {}) {
  return `<div class="a-scr ${cls}" style="background:${bg}">
    ${statusBar()}${top === 'app' ? topBar(lang) : top === 'onb' ? onbTop() : ''}
    <div class="a-content" style="padding:${pad}px 20px 20px">${inner}</div>
    ${footer ? `<div class="a-footer">${footer}</div>` : ''}
    ${tab ? tabBar(tab) : ''}</div>`;
}

export const device = (screens, { cls = '', style = '' } = {}) =>
  `<div class="dev ${cls}" style="${style}"><div class="dev-in">${screens}</div></div>`;

export { icon };
