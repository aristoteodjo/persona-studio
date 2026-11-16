import { describe, expect, it } from "vitest";
import { LM } from "@/modules/rig/landmarks";
import {
  autoBlink,
  calibrationFrom,
  faceSignals,
  headPoseFromLandmarks,
  idleFrame,
  NEUTRAL_CALIBRATION,
  rmsToLevel,
  signalsToFace,
  smoothFrame,
  updateTalk,
} from "@/modules/rig/rig";
import { fakeFace } from "@/test/fake-face";

describe("head pose", () => {
  it("is level and centered on a frontal face", () => {
    const pose = headPoseFromLandmarks(fakeFace(), 640, 480);
    expect(pose).not.toBeNull();
    expect(Math.abs(pose?.yaw ?? 1)).toBeLessThan(0.01);
    expect(Math.abs(pose?.roll ?? 1)).toBeLessThan(0.01);
  });

  it("reports yaw > 0 when the nose moves to image right", () => {
    const face = fakeFace();
    face[LM.noseTip] = { x: 0.56, y: 0.48, z: -0.08 };
    expect(headPoseFromLandmarks(face, 640, 480)?.yaw).toBeGreaterThan(0.2);
  });

  it("reports roll > 0 (clockwise) when the image-right eye drops", () => {
    const face = fakeFace();
    face[LM.eyeLeftOuter] = { x: 0.58, y: 0.43, z: 0 };
    expect(headPoseFromLandmarks(face, 640, 480)?.roll).toBeGreaterThan(0.1);
  });

  it("mirrors yaw, roll, x and swaps the eyes", () => {
    const face = fakeFace();
    face[LM.noseTip] = { x: 0.56, y: 0.48, z: -0.08 };
    const s = faceSignals(face, { eyeBlinkLeft: 1 }, 640, 480);
    if (!s) throw new Error("no signals");
    const plain = signalsToFace(s, {
      mirror: false,
      calibration: NEUTRAL_CALIBRATION,
    });
    const mirrored = signalsToFace(s, {
      mirror: true,
      calibration: NEUTRAL_CALIBRATION,
    });
    expect(mirrored.yaw).toBeCloseTo(-plain.yaw);
    expect(plain.blinkL).toBe(1);
    expect(mirrored.blinkR).toBe(1);
    expect(mirrored.blinkL).toBe(0);
  });

  it("calibration zeroes the current pose", () => {
    const face = fakeFace();
    face[LM.noseTip] = { x: 0.53, y: 0.5, z: -0.08 };
    const s = faceSignals(face, {}, 640, 480);
    if (!s) throw new Error("no signals");
    const out = signalsToFace(s, {
      mirror: true,
      calibration: calibrationFrom(s),
    });
    expect(out.yaw).toBeCloseTo(0);
    expect(out.pitch).toBeCloseTo(0);
    expect(out.roll).toBeCloseTo(0);
  });

  it("returns null when landmarks are missing", () => {
    expect(headPoseFromLandmarks([], 640, 480)).toBeNull();
  });
});

describe("voice", () => {
  it("holds the mouth open across short gaps, then closes", () => {
    let s = updateTalk({ talking: false, lastLoud: 0 }, 0.5, 0, 0.3);
    expect(s.talking).toBe(true);
    s = updateTalk(s, 0.1, 100, 0.3);
    expect(s.talking).toBe(true);
    s = updateTalk(s, 0.1, 400, 0.3);
    expect(s.talking).toBe(false);
  });

  it("maps silence to 0 and loud to 1", () => {
    expect(rmsToLevel(0)).toBe(0);
    expect(rmsToLevel(1)).toBe(1);
  });
});

describe("smoothing and blink", () => {
  it("moves toward the target without overshoot", () => {
    const a = idleFrame(0);
    const b = { ...idleFrame(16), yaw: 1 };
    const s = smoothFrame(a, b, 80);
    expect(s.yaw).toBeGreaterThan(0);
    expect(s.yaw).toBeLessThan(1);
  });

  it("auto blink stays within 0..1 and actually blinks", () => {
    let max = 0;
    for (let t = 0; t < 10000; t += 10) {
      const v = autoBlink(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      max = Math.max(max, v);
    }
    expect(max).toBeGreaterThan(0.9);
  });
});
