import { describe, expect, it } from "vitest";
import { forMetaVersion, vrmPose } from "@/modules/avatar/vrm/pose";
import { motionSchema, vrmSchema } from "@/modules/profiles/schema";
import { idleFrame } from "@/modules/rig/rig";

const cfg = vrmSchema.parse({});
const motion = motionSchema.parse({ breath: 0 });

describe("vrm pose", () => {
  it("is neutral at rest with arms lowered symmetrically", () => {
    const p = vrmPose(idleFrame(), cfg, motion, 0);
    expect(p.head).toEqual({ x: 0, y: 0, z: -0 });
    expect(p.leftUpperArm.z).toBeCloseTo(-cfg.arms);
    expect(p.rightUpperArm.z).toBeCloseTo(cfg.arms);
    expect(p.expressions.aa).toBe(0);
  });

  it("turns the head toward screen right on positive yaw", () => {
    const p = vrmPose({ ...idleFrame(), yaw: 0.4 }, cfg, motion, 0);
    expect(p.head.y + p.neck.y).toBeCloseTo(0.4 * 0.9);
  });

  it("maps clockwise roll to negative Z", () => {
    expect(
      vrmPose({ ...idleFrame(), roll: 0.3 }, cfg, motion, 0).head.z,
    ).toBeLessThan(0);
  });

  it("drives mouth and eyes, clamped to 1", () => {
    const p = vrmPose(
      { ...idleFrame(), mouthOpen: 1, blinkL: 1 },
      { ...cfg, mouth: 2 },
      motion,
      0,
    );
    expect(p.expressions.aa).toBe(1);
    expect(p.expressions.blinkLeft).toBe(1);
    expect(p.expressions.blinkRight).toBe(0);
  });

  it("flips X and Z for VRM 0.x", () => {
    expect(forMetaVersion({ x: 1, y: 2, z: 3 }, "0")).toEqual({
      x: -1,
      y: 2,
      z: -3,
    });
    expect(forMetaVersion({ x: 1, y: 2, z: 3 }, "1")).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
  });
});
