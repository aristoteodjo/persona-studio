import { describe, expect, it } from "vitest";
import { creatorPose } from "@/modules/avatar/creator/pose";
import { creatorSchema, motionSchema } from "@/modules/profiles/schema";
import { idleFrame } from "@/modules/rig/rig";

const cfg = creatorSchema.parse({});
const motion = motionSchema.parse({});

describe("creator pose", () => {
  it("rests with open eyes and a closed mouth", () => {
    const p = creatorPose(idleFrame(), cfg, motion, 0);
    expect(p.head).toEqual([0, 0, -0]);
    expect(p.eyeL).toBe(1);
    expect(p.eyeR).toBe(1);
    expect(p.mouth.y).toBeCloseTo(0.35);
  });

  it("follows screen conventions", () => {
    const p = creatorPose(
      { ...idleFrame(), yaw: 0.3, pitch: 0.2, roll: 0.1 },
      cfg,
      motion,
      0,
    );
    expect(p.head[1]).toBeGreaterThan(0);
    expect(p.head[0]).toBeGreaterThan(0);
    expect(p.head[2]).toBeLessThan(0);
    expect(Math.abs(p.body[1])).toBeLessThan(Math.abs(p.head[1]));
  });

  it("blinks the matching eye and opens the mouth", () => {
    const p = creatorPose(
      { ...idleFrame(), blinkR: 1, mouthOpen: 1 },
      cfg,
      motion,
      0,
    );
    expect(p.eyeR).toBeLessThan(0.1);
    expect(p.eyeL).toBe(1);
    expect(p.mouth.y).toBeGreaterThan(2);
  });
});
