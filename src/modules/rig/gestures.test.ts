import { describe, expect, it } from "vitest";
import {
  armRotations,
  armsFromPose,
  fingerCurls,
  isArmPose,
  type Landmark,
  quatForMetaVersion,
  quatFromUnitVectors,
  rotateInverse,
} from "@/modules/rig/gestures";

const lm = (x: number, y: number, z = 0, visibility = 1): Landmark => ({
  x,
  y,
  z,
  visibility,
});

/** World landmarks, image-aligned (y down): arms hanging straight down. */
function pose(overrides: Record<number, Landmark> = {}): Landmark[] {
  const p: Landmark[] = Array.from({ length: 33 }, () => lm(0, 0, 0, 0));
  // Subject's left shoulder is on image right (+x) for an unmirrored camera.
  p[11] = lm(0.2, -0.4);
  p[12] = lm(-0.2, -0.4);
  p[13] = lm(0.2, -0.1);
  p[14] = lm(-0.2, -0.1);
  p[15] = lm(0.2, 0.2);
  p[16] = lm(-0.2, 0.2);
  for (const [k, v] of Object.entries(overrides)) p[Number(k)] = v;
  return p;
}

describe("arms from pose", () => {
  it("maps hanging arms to straight down in avatar space", () => {
    const arms = armsFromPose(pose(), false);
    expect(arms.left?.upper[1]).toBeCloseTo(-1);
    expect(arms.right?.lower[1]).toBeCloseTo(-1);
  });

  it("a subject's raised right hand lands on the avatar's screen-right arm when mirrored", () => {
    const raised = pose({ 14: lm(-0.5, -0.4), 16: lm(-0.5, -0.8) });
    const mirrored = armsFromPose(raised, true);
    expect(mirrored.left?.upper[0]).toBeGreaterThan(0.9);
    expect(mirrored.left?.lower[1]).toBeGreaterThan(0.9);
    const plain = armsFromPose(raised, false);
    expect(plain.right?.upper[0]).toBeLessThan(-0.9);
  });

  it("ignores arms whose wrist is not visible", () => {
    const hidden = pose({ 15: lm(0.2, 0.2, 0, 0.1) });
    expect(armsFromPose(hidden, false).left).toBeNull();
  });
});

describe("bone rotations", () => {
  it("is identity in T-pose", () => {
    const r = armRotations(
      { upper: [1, 0, 0], lower: [1, 0, 0], curl: null },
      "left",
    );
    expect(r.upper[3]).toBeCloseTo(1);
    expect(r.lower[3]).toBeCloseTo(1);
  });

  it("lowers the left arm with a negative rotation around Z", () => {
    const r = armRotations(
      { upper: [0, -1, 0], lower: [0, -1, 0], curl: null },
      "left",
    );
    expect(r.upper[2]).toBeLessThan(0);
    expect(r.lower[3]).toBeCloseTo(1);
  });

  it("bends the forearm relative to the upper arm", () => {
    const r = armRotations(
      { upper: [0, -1, 0], lower: [0, 0, 1], curl: null },
      "right",
    );
    expect(r.lower[3]).toBeLessThan(0.9);
  });

  it("rotateInverse undoes a rotation", () => {
    const q = quatFromUnitVectors([1, 0, 0], [0, 1, 0]);
    const back = rotateInverse(q, [0, 1, 0]);
    expect(back[0]).toBeCloseTo(1);
    expect(back[1]).toBeCloseTo(0);
  });

  it("handles opposite vectors", () => {
    const q = quatFromUnitVectors([1, 0, 0], [-1, 0, 0]);
    expect(Math.hypot(...q)).toBeCloseTo(1);
    expect(q[3]).toBeCloseTo(0);
  });

  it("flips X and Z for VRM 0.x", () => {
    expect(quatForMetaVersion([0.1, 0.2, 0.3, 0.9], "0")).toEqual([
      -0.1, 0.2, -0.3, 0.9,
    ]);
  });
});

describe("fingers", () => {
  // Fingers fan out radially from the wrist, each one straight.
  const dir = (f: number) => {
    const a = (f - 2) * 0.25;
    return [Math.sin(a), -Math.cos(a)] as const;
  };
  const straight = (): Landmark[] => {
    const h: Landmark[] = [lm(0, 0)];
    for (let f = 0; f < 5; f++) {
      const [dx, dy] = dir(f);
      for (let j = 1; j <= 4; j++) h.push(lm(dx * j * 0.03, dy * j * 0.03));
    }
    return h;
  };

  it("reads an open hand as open", () => {
    expect(fingerCurls(straight())?.every((c) => c < 0.1)).toBe(true);
  });

  it("reads a folded index finger as curled", () => {
    const h = straight();
    // Index (landmarks 5-8): the last two joints fold back toward the palm.
    const [dx, dy] = dir(1);
    h[7] = lm(dx * 0.06, dy * 0.06, -0.03);
    h[8] = lm(dx * 0.04, dy * 0.04, -0.03);
    const curls = fingerCurls(h);
    expect(curls?.[1]).toBeGreaterThan(0.4);
    expect(curls?.[2]).toBeLessThan(0.1);
  });

  it("returns null for an incomplete hand", () => {
    expect(fingerCurls([lm(0, 0)])).toBeNull();
  });
});

describe("protocol validation", () => {
  it("accepts well-formed poses and rejects junk", () => {
    expect(isArmPose(null)).toBe(true);
    expect(
      isArmPose({
        left: null,
        right: { upper: [1, 0, 0], lower: [1, 0, 0], curl: [0, 0, 0, 0, 0] },
      }),
    ).toBe(true);
    expect(
      isArmPose({
        left: { upper: [1, 0], lower: [1, 0, 0], curl: null },
        right: null,
      }),
    ).toBe(false);
    expect(
      isArmPose({
        left: { upper: [Number.NaN, 0, 0], lower: [1, 0, 0], curl: null },
        right: null,
      }),
    ).toBe(false);
  });
});
