import { describe, expect, it } from "vitest";
import { live2dParams, PARAM } from "@/modules/avatar/live2d/params";
import { live2dSchema, motionSchema } from "@/modules/profiles/schema";
import { idleFrame } from "@/modules/rig/rig";

const cfg = live2dSchema.parse({});
const motion = motionSchema.parse({});

describe("live2d params", () => {
  it("keeps a neutral face neutral with open eyes", () => {
    const p = live2dParams(idleFrame(), cfg, motion, 0);
    expect(p[PARAM.angleX]).toBeCloseTo(0);
    expect(p[PARAM.angleY]).toBeCloseTo(0);
    expect(p[PARAM.angleZ]).toBeCloseTo(0);
    expect(p[PARAM.eyeL]).toBe(1);
    expect(p[PARAM.eyeR]).toBe(1);
    expect(p[PARAM.mouthOpen]).toBe(0);
  });

  it("follows screen conventions for head pose", () => {
    const p = live2dParams(
      { ...idleFrame(), yaw: 0.3, pitch: 0.2, roll: 0.1 },
      cfg,
      motion,
      0,
    );
    expect(p[PARAM.angleX]).toBeGreaterThan(0);
    expect(p[PARAM.angleY]).toBeLessThan(0);
    expect(p[PARAM.angleZ]).toBeLessThan(0);
    expect(p[PARAM.bodyX]).toBeGreaterThan(0);
  });

  it("closes the matching eye and clamps to cubism ranges", () => {
    const p = live2dParams(
      { ...idleFrame(), blinkL: 1, yaw: 5, mouthOpen: 3 },
      cfg,
      motion,
      0,
    );
    expect(p[PARAM.eyeL]).toBe(0);
    expect(p[PARAM.eyeR]).toBe(1);
    expect(p[PARAM.angleX]).toBe(30);
    expect(p[PARAM.mouthOpen]).toBe(1);
  });

  it("turns tracking down with the profile sliders", () => {
    const p = live2dParams(
      { ...idleFrame(), blinkR: 1, yaw: 0.3 },
      { ...cfg, eyes: 0, body: 0 },
      { ...motion, head: 0 },
      0,
    );
    expect(p[PARAM.eyeR]).toBe(1);
    expect(p[PARAM.angleX]).toBeCloseTo(0);
    expect(p[PARAM.bodyX]).toBeCloseTo(0);
  });
});
