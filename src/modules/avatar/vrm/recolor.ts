/** Pixel-level recoloring that keeps shading: hue is replaced, saturation and lightness are shifted. */

export type Hsl = { h: number; s: number; l: number };

export function rgbToHsl(r: number, g: number, b: number): Hsl {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rn) h = (gn - bn) / d + (gn < bn ? 6 : 0);
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  return { h: h / 6, s, l };
}

function hue2rgb(p: number, q: number, t: number) {
  let x = t;
  if (x < 0) x += 1;
  if (x > 1) x -= 1;
  if (x < 1 / 6) return p + (q - p) * 6 * x;
  if (x < 1 / 2) return q;
  if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
  return p;
}

export function hslToRgb({ h, s, l }: Hsl): [number, number, number] {
  if (s === 0) {
    const v = Math.round(l * 255);
    return [v, v, v];
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [
    Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, h) * 255),
    Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
  ];
}

export function hexToHsl(hex: string): Hsl {
  const n = Number.parseInt(hex.slice(1), 16);
  return rgbToHsl((n >> 16) & 255, (n >> 8) & 255, n & 255);
}

/** Average color of the visible pixels (alpha > 32), sampled for speed. */
export function averageHsl(data: Uint8ClampedArray, step = 7): Hsl {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4 * step) {
    if ((data[i + 3] ?? 0) <= 32) continue;
    r += data[i] ?? 0;
    g += data[i + 1] ?? 0;
    b += data[i + 2] ?? 0;
    n++;
  }
  return n === 0 ? { h: 0, s: 0, l: 0.5 } : rgbToHsl(r / n, g / n, b / n);
}

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/**
 * Moves every pixel so the part's average color becomes `target`: the hue is
 * set, saturation scaled and lightness offset, so folds and shadows survive.
 */
export function recolor(data: Uint8ClampedArray, target: Hsl, avg: Hsl): void {
  const satScale = avg.s > 0.02 ? target.s / avg.s : 1;
  const satAdd = avg.s > 0.02 ? 0 : target.s;
  const dl = target.l - avg.l;
  for (let i = 0; i < data.length; i += 4) {
    if ((data[i + 3] ?? 0) === 0) continue;
    const px = rgbToHsl(data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0);
    const [r, g, b] = hslToRgb({
      h: target.h,
      s: clamp01(px.s * satScale + satAdd),
      l: clamp01(px.l + dl),
    });
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}
