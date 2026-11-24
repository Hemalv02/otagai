import world2 from './world2.js';
import { hook, steps, enryo, helpers, turn } from './v2a.js';
import { join, explore, ask } from './v2b.js';
import { meet, rahimAsks, lend } from './v2c.js';
import { thank, family, circle, disaster, trust, close, hud } from './v2d.js';

export const scenes = [world2, hook, steps, enryo, helpers, turn, join, explore, ask, meet, rahimAsks, lend, thank, family, circle, disaster, trust, close, hud];
export const DURATION = 170;
export const BG = [[0, '#F8F5ED'], [124.9, '#F5EEE6', 0.4], [137.5, '#F8F5ED', 1.5]];
export const WARP = null;
export const GRAIN = 0.05;
export const FONTS = [
  ['400 20px Inter'], ['500 20px Inter'], ['600 20px Inter'], ['700 20px Inter'],
  ['400 20px Lora'], ['500 20px Lora'],
  ['400 20px "Geist Mono"'], ['500 20px "Geist Mono"'], ['700 20px "Geist Mono"'],
  ['400 20px "Noto Sans Bengali"', 'সাহায্য'], ['600 20px "Noto Sans Bengali"', 'সাহায্য'],
  ['400 20px "Noto Sans JP"', 'お互い'], ['700 20px "Noto Sans JP"', 'お互い'],
];
