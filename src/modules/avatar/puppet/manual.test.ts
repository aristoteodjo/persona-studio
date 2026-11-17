import { describe, expect, it } from "vitest";
import {
  ANCHORS,
  anchorsFrom,
  templateLandmarks,
  transformAnchors,
  warpLandmarks,
} from "@/modules/avatar/puppet/manual";
import { buildPuppetMesh } from "@/modules/avatar/puppet/mesh";
import { FACE_LANDMARK_COUNT } from "@/modules/profiles/schema";
import { LM } from "@/modules/rig/landmarks";

const W = 800;
const H = 1000;
const template = templateLandmarks(W, H);
const at = (lm: readonly number[], i: number) => ({
  x: (lm[i * 3] ?? 0) * W,
  y: (lm[i * 3 + 1] ?? 0) * H,
});

describe("manual face markers", () => {
  it("lays a frontal template inside the image in screen conventions", () => {
    expect(template).toHaveLength(FACE_LANDMARK_COUNT * 3);
    for (const v of template) expect(Number.isFinite(v)).toBe(true);
    for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
      const p = at(template, i);
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(W);
      expect(p.y).toBeGreaterThan(0);
      expect(p.y).toBeLessThan(H);
    }
    expect(at(template, LM.eyeRightOuter).x).toBeLessThan(
      at(template, LM.eyeLeftOuter).x,
    );
    expect(at(template, LM.foreheadTop).y).toBeLessThan(
      at(template, LM.chin).y,
    );
    // The nose is closer to the camera than the cheeks.
    expect(template[LM.noseTip * 3 + 2]).toBeLessThan(
      template[LM.cheekLeft * 3 + 2] ?? 0,
    );
  });

  it("builds a usable puppet from the template", () => {
    const mesh = buildPuppetMesh(template, W, H);
    expect(mesh.vertexCount).toBeGreaterThan(FACE_LANDMARK_COUNT);
    expect(mesh.mouthHalfWidth).toBeGreaterThan(2);
  });

  it("is the identity when no anchor moves", () => {
    const out = warpLandmarks(template, anchorsFrom(template, W, H), W, H);
    expect(out).not.toBeNull();
    for (let i = 0; i < template.length; i++) {
      expect(out?.[i]).toBeCloseTo(template[i] ?? 0, 3);
    }
  });

  it("puts the anchors exactly where they were dropped", () => {
    const targets = anchorsFrom(template, W, H).map((p, k) => ({
      x: p.x * 1.4 - 100 + (k % 3) * 6,
      y: p.y * 1.2 + 40 - (k % 2) * 8,
    }));
    const out = warpLandmarks(template, targets, W, H);
    if (!out) throw new Error("warp failed");
    ANCHORS.forEach(({ index }, k) => {
      const p = at(out, index);
      expect(p.x).toBeCloseTo(targets[k]?.x ?? 0, 0);
      expect(p.y).toBeCloseTo(targets[k]?.y ?? 0, 0);
    });
    const tz = template[LM.noseTip * 3 + 2] ?? 0;
    expect(Math.abs(out[LM.noseTip * 3 + 2] ?? 0)).toBeGreaterThan(
      Math.abs(tz),
    );
  });

  it("translates the whole face with its anchors", () => {
    const targets = anchorsFrom(template, W, H).map((p) => ({
      x: p.x + 50,
      y: p.y - 30,
    }));
    const out = warpLandmarks(template, targets, W, H);
    if (!out) throw new Error("warp failed");
    for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
      expect(at(out, i).x).toBeCloseTo(at(template, i).x + 50, 0);
      expect(at(out, i).y).toBeCloseTo(at(template, i).y - 30, 0);
    }
  });

  it("refuses stacked anchors", () => {
    const stacked = ANCHORS.map(() => ({ x: 10, y: 10 }));
    const source = new Array(FACE_LANDMARK_COUNT * 3).fill(0.5);
    expect(warpLandmarks(source, stacked, W, H)).toBeNull();
  });

  it("moves and scales anchors around their centroid", () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    expect(transformAnchors(pts, { dx: 5, dy: -5, scale: 2 })).toEqual([
      { x: 0, y: -10 },
      { x: 20, y: -10 },
      { x: 20, y: 10 },
      { x: 0, y: 10 },
    ]);
  });
});
