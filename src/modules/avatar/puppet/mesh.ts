import Delaunator from "delaunator";
import type { PuppetConfig } from "@/modules/profiles/schema";
import { FACE_LANDMARK_COUNT } from "@/modules/profiles/schema";
import {
  BROW_LEFT,
  BROW_RIGHT,
  EYE_LEFT_LOWER,
  EYE_LEFT_UPPER,
  EYE_RIGHT_LOWER,
  EYE_RIGHT_UPPER,
  FACE_OVAL,
  LM,
  LOWER_LIP_INNER,
  LOWER_LIP_OUTER,
  MOUTH_INNER_LOOP,
  UPPER_LIP_INNER,
  UPPER_LIP_OUTER,
} from "@/modules/rig/landmarks";
import type { RigFrame } from "@/modules/rig/rig";

/**
 * A puppet is the imported image cut into triangles: the 468 face landmarks
 * first (so landmark index == vertex index), then a coarse grid that keeps the
 * hair, body and background attached.
 */
export type PuppetMesh = {
  width: number;
  height: number;
  vertexCount: number;
  base: Float32Array;
  depth: Float32Array;
  uv: Float32Array;
  indices: Uint16Array;
  head: Float32Array;
  jaw: Float32Array;
  pivot: { x: number; y: number; z: number };
  faceRadius: number;
  mouthHalfWidth: number;
  eyeHeight: number;
};

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

function pointInPolygon(x: number, y: number, poly: [number, number][]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (!a || !b) continue;
    if (
      a[1] > y !== b[1] > y &&
      x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export function buildPuppetMesh(
  landmarks: readonly number[],
  width: number,
  height: number,
): PuppetMesh {
  if (landmarks.length < FACE_LANDMARK_COUNT * 3) {
    throw new Error("puppet needs 468 face landmarks");
  }
  const fx = (i: number) => (landmarks[i * 3] ?? 0) * width;
  const fy = (i: number) => (landmarks[i * 3 + 1] ?? 0) * height;
  const fz = (i: number) => (landmarks[i * 3 + 2] ?? 0) * width;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const i of FACE_OVAL) {
    cx += fx(i);
    cy += fy(i);
  }
  cx /= FACE_OVAL.length;
  cy /= FACE_OVAL.length;
  for (let i = 0; i < FACE_LANDMARK_COUNT; i++) cz += fz(i);
  cz /= FACE_LANDMARK_COUNT;

  let faceRadius = 0;
  for (const i of FACE_OVAL) {
    faceRadius = Math.max(faceRadius, Math.hypot(fx(i) - cx, fy(i) - cy));
  }
  faceRadius = Math.max(faceRadius, 8);

  const oval: [number, number][] = FACE_OVAL.map((i) => [fx(i), fy(i)]);
  const xs: number[] = [];
  const ys: number[] = [];
  const zs: number[] = [];
  for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
    xs.push(fx(i));
    ys.push(fy(i));
    zs.push(fz(i));
  }

  const spacing = Math.max(faceRadius * 0.32, Math.min(width, height) / 28);
  const cols = Math.max(2, Math.ceil(width / spacing));
  const rows = Math.max(2, Math.ceil(height / spacing));
  const minGap = spacing * 0.45;
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const x = (c / cols) * width;
      const y = (r / rows) * height;
      const onBorder = r === 0 || c === 0 || r === rows || c === cols;
      if (!onBorder) {
        if (pointInPolygon(x, y, oval)) continue;
        let tooClose = false;
        for (let i = 0; i < FACE_LANDMARK_COUNT && !tooClose; i++) {
          const dx = (xs[i] ?? 0) - x;
          const dy = (ys[i] ?? 0) - y;
          if (dx * dx + dy * dy < minGap * minGap) tooClose = true;
        }
        if (tooClose) continue;
      }
      xs.push(x);
      ys.push(y);
      zs.push(cz);
    }
  }

  const n = xs.length;
  const base = new Float32Array(n * 2);
  const uv = new Float32Array(n * 2);
  const depth = new Float32Array(n);
  const coords = new Float64Array(n * 2);
  for (let i = 0; i < n; i++) {
    const x = xs[i] ?? 0;
    const y = ys[i] ?? 0;
    base[i * 2] = x;
    base[i * 2 + 1] = y;
    coords[i * 2] = x;
    coords[i * 2 + 1] = y;
    uv[i * 2] = x / width;
    uv[i * 2 + 1] = y / height;
    depth[i] = zs[i] ?? cz;
  }

  const inner = new Set(MOUTH_INNER_LOOP);
  const tri = new Delaunator(coords).triangles;
  const kept: number[] = [];
  for (let t = 0; t < tri.length; t += 3) {
    const a = tri[t] ?? 0;
    const b = tri[t + 1] ?? 0;
    const c = tri[t + 2] ?? 0;
    // Triangles spanning the lips would stretch skin over the open mouth.
    if (inner.has(a) && inner.has(b) && inner.has(c)) continue;
    kept.push(a, b, c);
  }

  const chinY = fy(LM.chin);
  const head = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    if (i < FACE_LANDMARK_COUNT) {
      head[i] = 1;
      continue;
    }
    const x = base[i * 2] ?? 0;
    const y = base[i * 2 + 1] ?? 0;
    const d = Math.hypot(x - cx, y - cy);
    let w = 1 - smoothstep(faceRadius * 1.1, faceRadius * 2.1, d);
    if (y > chinY) w *= 1 - smoothstep(chinY, chinY + faceRadius * 0.7, y);
    head[i] = w;
  }

  const mouthCx = (fx(LM.mouthRight) + fx(LM.mouthLeft)) / 2;
  const mouthY = (fy(LM.upperLipInnerMid) + fy(LM.lowerLipInnerMid)) / 2;
  const mouthHalfWidth = Math.max(
    Math.abs(fx(LM.mouthLeft) - fx(LM.mouthRight)) / 2,
    2,
  );
  const lipBottom = fy(LM.lowerLipOuterMid);
  const upper = new Set([...UPPER_LIP_INNER, ...UPPER_LIP_OUTER]);
  const lower = new Set([...LOWER_LIP_INNER, ...LOWER_LIP_OUTER]);
  const corners = new Set<number>([
    LM.mouthRight,
    LM.mouthLeft,
    LM.mouthInnerRight,
    LM.mouthInnerLeft,
  ]);
  const jaw = new Float32Array(n);
  for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
    if (corners.has(i)) {
      jaw[i] = 0.25;
      continue;
    }
    if (upper.has(i)) continue;
    const x = fx(i);
    const y = fy(i);
    if (y < mouthY - 1 && !lower.has(i)) continue;
    const below = Math.max(y - mouthY, 0);
    const vertical =
      y <= lipBottom
        ? 1
        : 1 -
          0.45 * smoothstep(lipBottom, chinY, y) -
          0.55 * smoothstep(chinY, chinY + faceRadius * 0.3, y);
    const reach = mouthHalfWidth * 1.6 + below * 1.2;
    const lateral =
      1 - smoothstep(mouthHalfWidth * 0.55, reach, Math.abs(x - mouthCx));
    jaw[i] = Math.max(vertical, 0) * lateral;
  }

  const eyeHeight = Math.max(
    Math.abs(fy(EYE_RIGHT_LOWER[4] ?? 145) - fy(EYE_RIGHT_UPPER[4] ?? 159)),
    Math.abs(fy(EYE_LEFT_LOWER[4] ?? 374) - fy(EYE_LEFT_UPPER[4] ?? 386)),
    2,
  );

  return {
    width,
    height,
    vertexCount: n,
    base,
    depth,
    uv,
    indices: Uint16Array.from(kept),
    head,
    jaw,
    pivot: { x: cx, y: cy, z: cz + faceRadius * 0.7 },
    faceRadius,
    mouthHalfWidth,
    eyeHeight,
  };
}

export type DeformOptions = {
  head: number;
  config: Pick<PuppetConfig, "mouth" | "eyes" | "brows">;
};

const HEAD_ROTATION = 0.55;

/** Writes deformed vertex positions (image px) for one rig frame into `out`. */
export function deformPuppet(
  mesh: PuppetMesh,
  frame: RigFrame,
  { head, config }: DeformOptions,
  out: Float32Array = new Float32Array(mesh.vertexCount * 2),
): Float32Array {
  const { base, depth, pivot } = mesh;
  out.set(base);

  const open = frame.mouthOpen * config.mouth * mesh.mouthHalfWidth * 0.95;
  if (open > 0) {
    for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
      const w = mesh.jaw[i] ?? 0;
      if (w > 0) out[i * 2 + 1] = (out[i * 2 + 1] ?? 0) + open * w;
    }
  }

  const smile = frame.smile * config.mouth * mesh.mouthHalfWidth * 0.14;
  if (smile > 0) {
    for (const [i, dir] of [
      [LM.mouthRight, -1],
      [LM.mouthInnerRight, -1],
      [LM.mouthLeft, 1],
      [LM.mouthInnerLeft, 1],
    ] as const) {
      out[i * 2] = (out[i * 2] ?? 0) + dir * smile;
      out[i * 2 + 1] = (out[i * 2 + 1] ?? 0) - smile * 0.8;
    }
  }

  const blinkEye = (up: number[], low: number[], amount: number) => {
    const a = Math.min(amount * config.eyes, 1);
    if (a <= 0) return;
    for (let k = 1; k < up.length - 1; k++) {
      const u = up[k] ?? 0;
      const l = low[k] ?? 0;
      const uy = base[u * 2 + 1] ?? 0;
      const ly = base[l * 2 + 1] ?? 0;
      const meet = uy + (ly - uy) * 0.85;
      out[u * 2 + 1] = (out[u * 2 + 1] ?? 0) + (meet - uy) * a;
      out[l * 2 + 1] = (out[l * 2 + 1] ?? 0) + (meet - ly) * a * 0.25;
    }
  };
  // The avatar's left eye is on screen right: that is the subject's "left" landmarks.
  blinkEye(EYE_LEFT_UPPER, EYE_LEFT_LOWER, frame.blinkL);
  blinkEye(EYE_RIGHT_UPPER, EYE_RIGHT_LOWER, frame.blinkR);

  const brow = frame.browUp * config.brows * mesh.eyeHeight * 0.6;
  if (brow !== 0) {
    for (const i of [...BROW_LEFT, ...BROW_RIGHT]) {
      out[i * 2 + 1] = (out[i * 2 + 1] ?? 0) - brow;
    }
  }

  const yaw = frame.yaw * head * HEAD_ROTATION;
  const pitch = frame.pitch * head * HEAD_ROTATION;
  const roll = frame.roll * head * 0.9;
  const tx = frame.x * mesh.faceRadius * 0.25 * head;
  const ty = frame.y * mesh.faceRadius * 0.15 * head;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cp = Math.cos(pitch);
  const sp = Math.sin(pitch);
  const cr = Math.cos(roll);
  const sr = Math.sin(roll);
  for (let i = 0; i < mesh.vertexCount; i++) {
    const w = mesh.head[i] ?? 0;
    if (w <= 0) continue;
    const px = (out[i * 2] ?? 0) - pivot.x;
    const py = (out[i * 2 + 1] ?? 0) - pivot.y;
    const pz = (depth[i] ?? 0) - pivot.z;
    const x1 = px * cy - pz * sy;
    const z1 = px * sy + pz * cy;
    const y2 = py * cp - z1 * sp;
    const x3 = x1 * cr - y2 * sr;
    const y3 = x1 * sr + y2 * cr;
    out[i * 2] = pivot.x + px + (x3 - px + tx) * w;
    out[i * 2 + 1] = pivot.y + py + (y3 - py + ty) * w;
  }
  return out;
}

/** Polygon (as vertex indices) behind the lips, drawn as the mouth interior. */
export const MOUTH_INTERIOR = MOUTH_INNER_LOOP;
