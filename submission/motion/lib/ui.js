const I = {
  home: '<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1z"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  list: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 9h8M8 13h8M8 17h5"/>',
  chat: '<path d="M5 5h14a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H10l-5 4V6a1 1 0 0 1 1-1z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  send: '<path d="M4 12l16-8-6 16-2.5-6.5z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  star: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.8z"/>',
  sparkle: '<path d="M12 3c.6 4.2 2.8 6.4 9 9-6.2 2.6-8.4 4.8-9 9-.6-4.2-2.8-6.4-9-9 6.2-2.6 8.4-4.8 9-9z"/>',
  lock: '<rect x="4.5" y="10.5" width="15" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  gift: '<rect x="4" y="9" width="16" height="11" rx="1.5"/><path d="M3 9h18M12 9v11M12 9c-1.5-3-5-4-5-1.5S10 9 12 9zM12 9c1.5-3 5-4 5-1.5S14 9 12 9z"/>',
  note: '<path d="M6 3h9l4 4v14H6z"/><path d="M9 11h7M9 15h5"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.3A4.2 4.2 0 0 1 12 7.2a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"/>',
  globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.6 3.6 5.4 3.6 8.5s-1 5.9-3.6 8.5c-2.6-2.6-3.6-5.4-3.6-8.5s1-5.9 3.6-8.5z"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  drill: '<path d="M3 8h11v5H3zM14 9.5h4M18 10.5h3M7 13v6h4l-1-6"/>',
};
export const icon = (name, size = 24, color = 'currentColor', sw = 2) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex:none">${I[name]}</svg>`;

export const statusBar = () =>
  `<div class="status"><span>9:41</span><span style="display:flex;gap:7px;align-items:center"><svg width="18" height="12" viewBox="0 0 18 12"><rect x="0" y="8" width="3" height="4" rx="1" fill="currentColor"/><rect x="5" y="5" width="3" height="7" rx="1" fill="currentColor"/><rect x="10" y="2" width="3" height="10" rx="1" fill="currentColor"/><rect x="15" y="0" width="3" height="12" rx="1" fill="currentColor" opacity=".35"/></svg><svg width="27" height="13" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" fill="none" stroke="currentColor" opacity=".45"/><rect x="2.2" y="2.2" width="17" height="8.6" rx="2" fill="currentColor"/></svg></span></div>`;

export function tabBar(active = 'Home') {
  const tabs = [['home', 'Home'], ['search', 'Browse'], ['list', 'Requests'], ['chat', 'Ask']];
  return `<div class="tabs">${tabs.map(([ic, l]) => `<div class="tab ${l === active ? 'on' : ''}"><div class="ic">${icon(ic, 24)}</div>${l}</div>`).join('')}</div>`;
}

export const phone = (inner, { cls = '', style = '', tab = 'Home' } = {}) =>
  `<div class="phone ${cls}" style="${style}">${statusBar()}<div class="body">${inner}</div>${tabBar(tab)}</div>`;

export const avatar = (src, size = 56) => `<div class="avatar" style="width:${size}px;height:${size}px"><img src="${src}"></div>`;

export const TANAKA = 'assets/onboarding-tanaka.png';
export const RAHIM = 'assets/onboarding-rahim.png';

export function glyphs(text, mode) {
  if (mode === 'char') return [...text].map((c) => `<span class="g" style="display:inline-block">${c}</span>`).join('');
  return text.split(' ').map((w) => `<span class="g" style="display:inline-block">${w}</span>`).join(' ');
}

export { I as ICONS };
