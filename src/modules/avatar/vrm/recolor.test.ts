import { describe, expect, it } from "vitest";
import {
  averageHsl,
  hexToHsl,
  hslToRgb,
  recolor,
  rgbToHsl,
} from "@/modules/avatar/vrm/recolor";

const px = (...rgba: number[]) => new Uint8ClampedArray(rgba);

describe("recolor", () => {
  it("round-trips rgb and hsl", () => {
    for (const c of [
      [255, 0, 0],
      [12, 200, 90],
      [128, 128, 128],
      [250, 240, 10],
    ] as const) {
      const back = hslToRgb(rgbToHsl(c[0], c[1], c[2]));
      for (const [i, v] of back.entries()) {
        expect(Math.abs(v - (c[i] ?? 0))).toBeLessThanOrEqual(1);
      }
    }
  });

  it("turns brown hair into blond while keeping darker shadows darker", () => {
    // Two brown pixels: a lit one and a shadow.
    const data = px(140, 90, 50, 255, 70, 45, 25, 255);
    const avg = averageHsl(data, 1);
    recolor(data, hexToHsl("#f2d27a"), avg);
    const lit = rgbToHsl(data[0] ?? 0, data[1] ?? 0, data[2] ?? 0);
    const shadow = rgbToHsl(data[4] ?? 0, data[5] ?? 0, data[6] ?? 0);
    expect(lit.l).toBeGreaterThan(0.6);
    expect(shadow.l).toBeLessThan(lit.l);
    expect(Math.abs(lit.h - hexToHsl("#f2d27a").h)).toBeLessThan(0.02);
  });

  it("leaves transparent pixels and ignores them in the average", () => {
    const data = px(10, 20, 30, 0, 200, 0, 0, 255);
    expect(averageHsl(data, 1).h).toBeCloseTo(0);
    recolor(data, hexToHsl("#0000ff"), averageHsl(data, 1));
    expect([data[0], data[1], data[2]]).toEqual([10, 20, 30]);
  });

  it("can colorize a grey part", () => {
    const data = px(128, 128, 128, 255);
    recolor(data, hexToHsl("#ff0000"), averageHsl(data, 1));
    expect(data[0]).toBeGreaterThan((data[1] ?? 0) + 50);
  });
});
