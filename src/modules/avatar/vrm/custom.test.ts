import { Color } from "three";
import { describe, expect, it } from "vitest";
import { grayOf } from "@/modules/avatar/vrm/custom";

describe("vrm custom", () => {
  it("drops a factor's hue but keeps its brightness", () => {
    const lavender = new Color(0.72, 0.67, 1);
    const g = grayOf(new Color(), lavender);
    expect(g.r).toBeCloseTo(g.g);
    expect(g.g).toBeCloseTo(g.b);
    expect(g.r).toBeCloseTo(0.2126 * 0.72 + 0.7152 * 0.67 + 0.0722);
  });
});
