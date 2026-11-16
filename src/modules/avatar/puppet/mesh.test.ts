import { describe, expect, it } from "vitest";
import { buildPuppetMesh, deformPuppet } from "@/modules/avatar/puppet/mesh";
import { EYE_LEFT_UPPER, LM, MOUTH_INNER_LOOP } from "@/modules/rig/landmarks";
import { idleFrame } from "@/modules/rig/rig";
import { fakeFace, flatten } from "@/test/fake-face";

const mesh = buildPuppetMesh(flatten(fakeFace()), 800, 1000);
const opts = { head: 1, config: { mouth: 1, eyes: 1, brows: 1 } };

describe("puppet mesh", () => {
  it("keeps landmarks first and only valid triangles", () => {
    expect(mesh.vertexCount).toBeGreaterThan(468);
    expect(mesh.indices.length % 3).toBe(0);
    for (const i of mesh.indices) expect(i).toBeLessThan(mesh.vertexCount);
  });

  it("cuts a hole in the mouth", () => {
    const inner = new Set(MOUTH_INNER_LOOP);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const tri = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
      expect(tri.every((i) => inner.has(i ?? -1))).toBe(false);
    }
  });

  it("is the identity on a neutral frame", () => {
    const out = deformPuppet(mesh, idleFrame(), opts);
    for (let i = 0; i < out.length; i++)
      expect(out[i]).toBeCloseTo(mesh.base[i] ?? 0, 3);
  });

  it("opens the jaw without moving the upper lip", () => {
    const out = deformPuppet(mesh, { ...idleFrame(), mouthOpen: 1 }, opts);
    expect(out[LM.lowerLipInnerMid * 2 + 1]).toBeGreaterThan(
      (mesh.base[LM.lowerLipInnerMid * 2 + 1] ?? 0) + 5,
    );
    expect(out[LM.upperLipInnerMid * 2 + 1]).toBeCloseTo(
      mesh.base[LM.upperLipInnerMid * 2 + 1] ?? 0,
      3,
    );
  });

  it("closes the avatar's left eye (screen right) on blinkL", () => {
    const lid = EYE_LEFT_UPPER[4] ?? 386;
    const out = deformPuppet(mesh, { ...idleFrame(), blinkL: 1 }, opts);
    expect(out[lid * 2 + 1]).toBeGreaterThan(mesh.base[lid * 2 + 1] ?? 0);
  });

  it("turns the nose toward screen right on positive yaw", () => {
    const out = deformPuppet(mesh, { ...idleFrame(), yaw: 0.5 }, opts);
    expect(out[LM.noseTip * 2]).toBeGreaterThan(mesh.base[LM.noseTip * 2] ?? 0);
  });

  it("leaves the image corners in place", () => {
    const out = deformPuppet(
      mesh,
      { ...idleFrame(), yaw: 0.6, roll: 0.5 },
      opts,
    );
    const last = mesh.vertexCount - 1;
    expect(out[last * 2]).toBeCloseTo(mesh.base[last * 2] ?? 0);
    expect(out[last * 2 + 1]).toBeCloseTo(mesh.base[last * 2 + 1] ?? 0);
  });
});
