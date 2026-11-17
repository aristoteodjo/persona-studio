import { describe, expect, it } from "vitest";
import {
  armRotations,
  armsFromPose,
  avoidTorso,
  fingerCurls,
  isArmPose,
  type Landmark,
  quatForMetaVersion,
  quatFromUnitVectors,
  rotateInverse,
  sidesSwapped,
  smoothArms,
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

/** Image landmarks (normalized, y down) of a subject facing the camera, hands at chest height. */
function imagePose(overrides: Record<number, Landmark> = {}): Landmark[] {
  const p: Landmark[] = Array.from({ length: 33 }, () => lm(0.5, 0.5));
  p[11] = lm(0.65, 0.5);
  p[12] = lm(0.35, 0.5);
  p[15] = lm(0.7, 0.8);
  p[16] = lm(0.3, 0.8);
  for (const [k, v] of Object.entries(overrides)) p[Number(k)] = v;
  return p;
}

describe("arm evidence", () => {
  const bothHands = [
    { x: 0.7, y: 0.8 },
    { x: 0.3, y: 0.8 },
  ];

  it("trusts shoulder geometry over swapped pose labels", () => {
    const raised = pose({ 14: lm(-0.5, -0.4), 16: lm(-0.5, -0.8) });
    const good = armsFromPose(raised, true, undefined, {
      image: imagePose(),
      hands: bothHands,
    });
    // Same body with every left/right label swapped, world and image alike.
    const swap = (p: Landmark[]) => {
      const q = [...p];
      for (const [a, b] of [
        [11, 12],
        [13, 14],
        [15, 16],
      ] as const) {
        q[a] = p[b] as Landmark;
        q[b] = p[a] as Landmark;
      }
      return q;
    };
    const image = swap(imagePose());
    expect(sidesSwapped(image)).toBe(true);
    const flipped = armsFromPose(swap(raised), true, undefined, {
      image,
      hands: bothHands,
    });
    expect(flipped.left?.upper).toEqual(good.left?.upper);
    expect(flipped.right?.upper).toEqual(good.right?.upper);
  });

  it("ignores an arm whose wrist is below the frame", () => {
    const image = imagePose({ 15: lm(0.7, 1.1) });
    const arms = armsFromPose(pose(), false, undefined, {
      image,
      hands: bothHands,
    });
    expect(arms.left).toBeNull();
    expect(arms.right).not.toBeNull();
  });

  it("needs a detected hand to start tracking, not to keep it", () => {
    const image = imagePose();
    const oneHand = [{ x: 0.3, y: 0.8 }];
    const start = armsFromPose(pose(), false, undefined, {
      image,
      hands: oneHand,
    });
    expect(start.left).toBeNull();
    expect(start.right).not.toBeNull();
    const kept = armsFromPose(
      pose(),
      false,
      { left: true, right: true },
      { image, hands: [] },
    );
    expect(kept.left).not.toBeNull();
  });
});

describe("body collision", () => {
  it("leaves a hanging arm alone", () => {
    const r = avoidTorso([0, -1, 0], [0, -1, 0], "left");
    expect(r.upper).toEqual([0, -1, 0]);
    expect(r.lower).toEqual([0, -1, 0]);
  });

  it("brings a hand reaching across the chest out in front of it", () => {
    const r = avoidTorso([0, -1, 0], [-0.4, 0.9, 0], "left");
    const elbow = [0.17, -0.27, 0];
    const wrist = elbow.map((v, i) => v + (r.lower[i] ?? 0) * 0.25);
    expect(wrist[2]).toBeGreaterThanOrEqual(0.12 - 1e-9);
    expect(Math.hypot(...r.lower)).toBeCloseTo(1);
    // The hand still heads inward and up.
    expect(r.lower[0]).toBeLessThan(0);
    expect(r.lower[1]).toBeGreaterThan(0);
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

describe("stability", () => {
  const arm = (x: number, y: number) => ({
    upper: [x, y, 0] as [number, number, number],
    lower: [x, y, 0] as [number, number, number],
    curl: null,
  });

  it("holds an arm through small jitter and follows real moves", () => {
    const still = { left: arm(0, -1), right: null };
    const jitter = { left: arm(0.02, -0.9998), right: null };
    expect(smoothArms(still, jitter, 33)?.left?.upper).toEqual(
      still.left.upper,
    );
    const moved = smoothArms(still, { left: arm(1, 0), right: null }, 33);
    expect(moved?.left?.upper[0]).toBeGreaterThan(0.05);
    expect(moved?.left?.upper[0]).toBeLessThan(1);
  });

  it("needs a clear view to start tracking but keeps a tracked arm through dips", () => {
    const dim = pose({ 13: lm(0.2, -0.1, 0, 0.6), 15: lm(0.2, 0.2, 0, 0.6) });
    expect(armsFromPose(dim, false).left).toBeNull();
    expect(
      armsFromPose(dim, false, { left: true, right: false }).left,
    ).not.toBeNull();
  });

  it("never lets a forearm fold straight through the body", () => {
    const inward = armRotations(
      { upper: [1, 0, 0], lower: [-1, 0, 0], curl: null },
      "left",
    );
    // Unclamped this would be a 180 degree fold (w = 0).
    expect(Math.abs(inward.lower[3])).toBeGreaterThan(0.3);
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
