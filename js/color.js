export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));

export const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

export const rgbToHex = (rgb) =>
  '#' + rgb.map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('').toUpperCase();

const toLin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const toGam = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);

export function toOklab(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function labToLinear([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

export const fromOklab = (lab) => rgbToHex(labToLinear(lab).map((v) => toGam(clamp(v))));

export function toOklch(hex) {
  const [L, a, b] = toOklab(hex);
  return [L, Math.hypot(a, b), (Math.atan2(b, a) * 180 / Math.PI + 360) % 360];
}

export function fromOklch(L, c, h) {
  const rad = h * Math.PI / 180;
  for (let i = 0; i < 24; i++) {
    const lab = [L, c * Math.cos(rad), c * Math.sin(rad)];
    if (labToLinear(lab).every((v) => v >= -0.001 && v <= 1.001)) return fromOklab(lab);
    c *= 0.9;
  }
  return fromOklab([L, 0, 0]);
}

export function mix(h1, h2, t = 0.5) {
  const a = toOklab(h1), b = toOklab(h2);
  return fromOklab(a.map((v, i) => v + (b[i] - v) * t));
}

export function tone(hex, L, cScale = 1) {
  const [, c, h] = toOklch(hex);
  return fromOklch(clamp(L, 0.04, 0.99), c * cScale, h);
}

export function ladder(hex, n = 7, step = 0.085) {
  const [L, c, h] = toOklch(hex);
  const mid = (n - 1) / 2;
  const span = step * mid;
  const centre = clamp(L, 0.1 + span, 0.97 - span);
  return Array.from({ length: n }, (_, i) => {
    if (i === mid) return hex.toUpperCase();
    const l = centre + (mid - i) * step;
    return fromOklch(l, c * (1 - Math.abs(i - mid) * 0.08), h);
  });
}

export function hsl(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  const s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  return [Math.round(h), Math.round(s * 100), Math.round(l * 100)];
}

export function cmyk(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return [0, 0, 0, 100];
  return [(1 - r - k) / (1 - k), (1 - g - k) / (1 - k), (1 - b - k) / (1 - k), k].map((v) => Math.round(v * 100));
}

export function lum(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

export const INK = '#17141C';
export const ink = (hex) => (lum(hex) < 0.34 ? '#FFFFFF' : INK);

export function code(hex) {
  const [L, c, h] = toOklch(hex);
  const p = (v, n) => String(Math.round(v)).padStart(n, '0');
  return `LC ${p(h % 360, 3)}-${p(L * 100, 2)}${p(Math.min(99, c * 250), 2)}`;
}

export function temp(hex) {
  const [h, s] = hsl(hex);
  if (s < 10) return '뉴트럴';
  if (h <= 80 || h >= 320) return '웜';
  if (h >= 150 && h <= 280) return '쿨';
  return '미들';
}

export function hueGap(a, b) {
  const d = Math.abs(hsl(a)[0] - hsl(b)[0]);
  return Math.min(d, 360 - d);
}

export function relation(a, b) {
  if (hsl(a)[1] < 10 || hsl(b)[1] < 10) return ['무채 대비', '한쪽이 색을 비워 다른 쪽을 돋운다'];
  const d = hueGap(a, b);
  if (d < 25) return ['동일 계열', '같은 결에서 농도만 다르다'];
  if (d < 60) return ['유사색', '나란히 놓으면 자연스럽게 이어진다'];
  if (d < 110) return ['중간 대비', '닮지 않았지만 부딪히지 않는다'];
  if (d < 150) return ['분열 보색', '긴장이 있어서 서로가 또렷해진다'];
  return ['보색', '색상환의 정반대에서 마주 본다'];
}
