import { FAMILIES, NEUTRALS, TONES, FINISHES, RELATIONS, RATIO } from './lexicon.js';
import { hsl, toOklch, hueGap } from './color.js';

function seedOf(str) {
  let h = 2166136261;
  for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}
const pick = (list, seed) => list[seed % list.length];

function toneOf(L, C, S) {
  if (C < 0.022) return 'neutral';
  const strong = C >= 0.15 || (S >= 70 && C >= 0.1);
  const some = C >= 0.09 || (S >= 50 && C >= 0.06);
  if (L >= 0.75) return strong || C >= 0.1 ? 'bright' : C < 0.055 && S < 40 ? 'grayish' : 'pale';
  if (L >= 0.55 || (strong && C >= 0.17 && L >= 0.45)) return strong ? 'vivid' : some ? 'soft' : 'grayish';
  return C >= 0.12 ? 'deep' : C >= 0.05 ? 'dark' : 'darkgray';
}

function familyOf(h, L) {
  if (h >= 345 || h < 15) return L > 0.7 ? 'pink' : 'red';
  if (h < 40) return L > 0.86 ? 'pink' : 'orange';
  if (h < 65) return 'yellow';
  if (h < 95) return 'lime';
  if (h < 150) return 'green';
  if (h < 185) return 'teal';
  if (h < 205) return 'sky';
  if (h < 232) return 'blue';
  if (h < 252) return L > 0.62 ? 'violet' : 'navy';
  if (h < 288) return 'violet';
  if (h < 322) return 'plum';
  return 'pink';
}

export function traits(hex) {
  const [h, S] = hsl(hex);
  const [L, C] = toOklch(hex);
  const tone = toneOf(L, C, S);
  let family = tone === 'neutral' ? 'neutral' : familyOf(h, L);
  if (family === 'pink' && (tone === 'deep' || tone === 'dark' || tone === 'darkgray')) family = 'plum';
  return { family, tone, L, C };
}

function baseName(t) {
  if (t.family === 'neutral') return NEUTRALS.find(([min]) => t.L >= min)[1];
  return FAMILIES[t.family].names[TONES[t.tone].group];
}

function join(t, [nk, ne]) {
  const tn = TONES[t.tone];
  return tn.ko ? { ko: `${tn.ko} ${nk}`, en: `${tn.en} ${ne}` } : { ko: nk, en: ne };
}

export const colorName = (hex) => { const t = traits(hex); return join(t, baseName(t)); };

export function reason(hex, kind) {
  const t = traits(hex);
  return `${FAMILIES[t.family][kind === 'love' ? 'love' : 'sym']} ${TONES[t.tone].line}`;
}

export function keywords(hex) {
  const list = [...FAMILIES[traits(hex).family].kw];
  let seed = seedOf(hex);
  const out = [];
  while (out.length < 3 && list.length) {
    out.push(list.splice(seed % list.length, 1)[0]);
    seed = Math.floor(seed / 7) + 3;
  }
  return out;
}

export function finish(hex) {
  const t = traits(hex);
  const key = {
    neutral: t.L > 0.7 ? 'metal' : 'matte',
    darkgray: 'velvet', dark: 'velvet',
    pale: 'sheer', bright: 'gloss',
    vivid: 'pearl', deep: 'pearl',
  }[t.tone] || 'matte';
  return { key, label: FINISHES[key][0], why: FINISHES[key][1] };
}

export function relationKey(a, b) {
  if (traits(a).family === 'neutral' || traits(b).family === 'neutral') return 'neutral';
  const d = hueGap(a, b);
  if (d < 25) return 'same';
  if (d < 60) return 'analog';
  if (d < 110) return 'contrast';
  if (d < 150) return 'split';
  return 'complement';
}

export const mixName = (mixHex) => { const t = traits(mixHex); return join(t, FAMILIES[t.family].mix); };
export const mixDesc = (la, lb) => RELATIONS[relationKey(la, lb)].desc;
export const phrase = (la, lb) => pick(RELATIONS[relationKey(la, lb)].line, seedOf(la + lb));

export function ratioWhy([ra, rb], nameA, nameB) {
  const lead = Math.max(ra, rb);
  const name = ra >= rb ? nameA : nameB;
  if (lead <= 53) return RATIO.even;
  return (lead <= 65 ? RATIO.lean : RATIO.strong).replace('{name}', name);
}
