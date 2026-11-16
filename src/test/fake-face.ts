import { FACE_LANDMARK_COUNT } from "@/modules/profiles/schema";
import {
  EYE_LEFT_LOWER,
  EYE_LEFT_UPPER,
  EYE_RIGHT_LOWER,
  EYE_RIGHT_UPPER,
  FACE_OVAL,
  LM,
  LOWER_LIP_INNER,
  LOWER_LIP_OUTER,
  UPPER_LIP_INNER,
  UPPER_LIP_OUTER,
} from "@/modules/rig/landmarks";
import type { Point } from "@/modules/rig/rig";

/** Deterministic, roughly face-shaped landmark set for tests (normalized coords). */
export function fakeFace(): Point[] {
  const pts: Point[] = [];
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * 0.12;
    pts.push({
      x: 0.5 + Math.cos(a) * r,
      y: 0.45 + Math.sin(a) * r * 1.3,
      z: -0.02,
    });
  }
  const set = (i: number, x: number, y: number, z = 0) => {
    pts[i] = { x, y, z };
  };
  FACE_OVAL.forEach((i, k) => {
    const a = (k / FACE_OVAL.length) * Math.PI * 2 - Math.PI / 2;
    set(i, 0.5 + Math.cos(a) * 0.15, 0.45 + Math.sin(a) * 0.2, 0.03);
  });
  const row = (
    ids: number[],
    x0: number,
    x1: number,
    y: number,
    bulge: number,
  ) => {
    ids.forEach((i, k) => {
      const t = k / (ids.length - 1);
      set(i, x0 + (x1 - x0) * t, y + Math.sin(t * Math.PI) * bulge, -0.03);
    });
  };
  row(UPPER_LIP_OUTER, 0.46, 0.54, 0.55, -0.01);
  row(UPPER_LIP_INNER, 0.465, 0.535, 0.56, -0.001);
  row(LOWER_LIP_INNER, 0.465, 0.535, 0.56, 0.001);
  row(LOWER_LIP_OUTER, 0.46, 0.54, 0.56, 0.015);
  row(EYE_RIGHT_UPPER, 0.42, 0.47, 0.4, -0.01);
  row(EYE_RIGHT_LOWER, 0.42, 0.47, 0.4, 0.01);
  row(EYE_LEFT_UPPER, 0.58, 0.53, 0.4, -0.01);
  row(EYE_LEFT_LOWER, 0.58, 0.53, 0.4, 0.01);
  set(LM.noseTip, 0.5, 0.48, -0.08);
  set(LM.noseBridge, 0.5, 0.4, -0.04);
  set(LM.cheekRight, 0.36, 0.45, 0.03);
  set(LM.cheekLeft, 0.64, 0.45, 0.03);
  return pts;
}

export const flatten = (pts: Point[]) =>
  pts.flatMap((p) => [p.x, p.y, p.z ?? 0]);
