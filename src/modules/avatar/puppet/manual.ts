import { CANONICAL_FACE } from "@/modules/avatar/puppet/canonical-face";
import { FACE_LANDMARK_COUNT } from "@/modules/profiles/schema";

export type AnchorGroup = "face" | "eyes" | "brows" | "nose" | "mouth";

export type Anchor = {
  id: string;
  index: number;
  label: string;
  group: AnchorGroup;
};

/** Points the user places by hand. Labels follow the screen, not the character's own sides. */
export const ANCHORS: readonly Anchor[] = [
  { id: "forehead", index: 10, label: "Haut du front", group: "face" },
  { id: "chin", index: 152, label: "Menton", group: "face" },
  { id: "cheekL", index: 234, label: "Joue à gauche", group: "face" },
  { id: "cheekR", index: 454, label: "Joue à droite", group: "face" },
  {
    id: "eyeLOut",
    index: 33,
    label: "Œil gauche, coin extérieur",
    group: "eyes",
  },
  {
    id: "eyeLIn",
    index: 133,
    label: "Œil gauche, coin intérieur",
    group: "eyes",
  },
  {
    id: "eyeLTop",
    index: 159,
    label: "Œil gauche, paupière haute",
    group: "eyes",
  },
  {
    id: "eyeLBot",
    index: 145,
    label: "Œil gauche, paupière basse",
    group: "eyes",
  },
  {
    id: "eyeRIn",
    index: 362,
    label: "Œil droit, coin intérieur",
    group: "eyes",
  },
  {
    id: "eyeROut",
    index: 263,
    label: "Œil droit, coin extérieur",
    group: "eyes",
  },
  {
    id: "eyeRTop",
    index: 386,
    label: "Œil droit, paupière haute",
    group: "eyes",
  },
  {
    id: "eyeRBot",
    index: 374,
    label: "Œil droit, paupière basse",
    group: "eyes",
  },
  { id: "browL", index: 105, label: "Sourcil gauche", group: "brows" },
  { id: "browR", index: 334, label: "Sourcil droit", group: "brows" },
  { id: "nose", index: 1, label: "Bout du nez", group: "nose" },
  { id: "mouthL", index: 61, label: "Bouche, coin gauche", group: "mouth" },
  { id: "mouthR", index: 291, label: "Bouche, coin droit", group: "mouth" },
  { id: "lipTop", index: 0, label: "Lèvre du haut", group: "mouth" },
  { id: "lipBot", index: 17, label: "Lèvre du bas", group: "mouth" },
];

export type Px = { x: number; y: number };

/** Anchor positions in image pixels, in `ANCHORS` order. */
export function anchorsFrom(
  landmarks: readonly number[],
  width: number,
  height: number,
): Px[] {
  return ANCHORS.map(({ index }) => ({
    x: (landmarks[index * 3] ?? 0) * width,
    y: (landmarks[index * 3 + 1] ?? 0) * height,
  }));
}

/** Canonical face laid frontally in the image, sized to a third of its short side. */
export function templateLandmarks(width: number, height: number): number[] {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
    const x = CANONICAL_FACE[i * 3] ?? 0;
    const y = CANONICAL_FACE[i * 3 + 1] ?? 0;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const scale = (Math.min(width, height) * 0.36) / (maxY - minY);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const out: number[] = [];
  for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
    const x = width / 2 + ((CANONICAL_FACE[i * 3] ?? 0) - cx) * scale;
    const y = height * 0.42 - ((CANONICAL_FACE[i * 3 + 1] ?? 0) - cy) * scale;
    // MediaPipe z shrinks toward the camera and is scaled like x.
    const z = (-(CANONICAL_FACE[i * 3 + 2] ?? 0) * scale) / width;
    out.push(x / width, y / height, z);
  }
  return out;
}

const kernel = (r2: number) => (r2 < 1e-12 ? 0 : r2 * Math.log(r2) * 0.5);

function solve(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  const m = a.map((row, i) => [...row, b[i] ?? 0]);
  for (let c = 0; c < n; c++) {
    let pivot = c;
    for (let r = c + 1; r < n; r++) {
      if (Math.abs(m[r]?.[c] ?? 0) > Math.abs(m[pivot]?.[c] ?? 0)) pivot = r;
    }
    const pr = m[pivot];
    const cr = m[c];
    if (!pr || !cr || Math.abs(pr[c] ?? 0) < 1e-12) return null;
    m[pivot] = cr;
    m[c] = pr;
    for (let r = 0; r < n; r++) {
      const row = m[r];
      if (r === c || !row) continue;
      const f = (row[c] ?? 0) / (pr[c] ?? 1);
      if (f === 0) continue;
      for (let k = c; k <= n; k++) row[k] = (row[k] ?? 0) - f * (pr[k] ?? 0);
    }
  }
  return m.map((row, i) => (row[n] ?? 0) / (row[i] ?? 1));
}

/**
 * Moves every landmark so the anchors land on `targets` (image px), with a thin
 * plate spline: anchors match exactly, the rest of the face follows smoothly.
 * Returns null when the anchors are degenerate (stacked or collinear).
 */
export function warpLandmarks(
  source: readonly number[],
  targets: readonly Px[],
  width: number,
  height: number,
): number[] | null {
  if (
    source.length < FACE_LANDMARK_COUNT * 3 ||
    targets.length !== ANCHORS.length
  ) {
    return null;
  }
  const from = anchorsFrom(source, width, height);
  const n = from.length;
  const size = n + 3;
  const a: number[][] = Array.from({ length: size }, () =>
    new Array<number>(size).fill(0),
  );
  for (let i = 0; i < n; i++) {
    const pi = from[i] as Px;
    const row = a[i] as number[];
    for (let j = 0; j < n; j++) {
      const pj = from[j] as Px;
      row[j] = kernel((pi.x - pj.x) ** 2 + (pi.y - pj.y) ** 2);
    }
    row[n] = 1;
    row[n + 1] = pi.x;
    row[n + 2] = pi.y;
    (a[n] as number[])[i] = 1;
    (a[n + 1] as number[])[i] = pi.x;
    (a[n + 2] as number[])[i] = pi.y;
  }
  const bx = [...targets.map((t) => t.x), 0, 0, 0];
  const by = [...targets.map((t) => t.y), 0, 0, 0];
  const wx = solve(a, bx);
  const wy = solve(a, by);
  if (!wx || !wy) return null;

  // Depth follows the local scale of the warp, measured on the affine part.
  const sx = Math.hypot(wx[n + 1] ?? 0, wy[n + 1] ?? 0);
  const sy = Math.hypot(wx[n + 2] ?? 0, wy[n + 2] ?? 0);
  const zScale = Math.sqrt(sx * sy);

  const out: number[] = [];
  for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
    const x = (source[i * 3] ?? 0) * width;
    const y = (source[i * 3 + 1] ?? 0) * height;
    let u = (wx[n] ?? 0) + (wx[n + 1] ?? 0) * x + (wx[n + 2] ?? 0) * y;
    let v = (wy[n] ?? 0) + (wy[n + 1] ?? 0) * x + (wy[n + 2] ?? 0) * y;
    for (let j = 0; j < n; j++) {
      const p = from[j] as Px;
      const k = kernel((x - p.x) ** 2 + (y - p.y) ** 2);
      u += (wx[j] ?? 0) * k;
      v += (wy[j] ?? 0) * k;
    }
    const z = (source[i * 3 + 2] ?? 0) * zScale;
    if (!Number.isFinite(u) || !Number.isFinite(v) || !Number.isFinite(z)) {
      return null;
    }
    out.push(
      Math.round((u / width) * 1e5) / 1e5,
      Math.round((v / height) * 1e5) / 1e5,
      Math.round(z * 1e5) / 1e5,
    );
  }
  return out;
}

/** Moves then scales a whole set of anchors around their centroid. */
export function transformAnchors(
  points: readonly Px[],
  { dx = 0, dy = 0, scale = 1 }: { dx?: number; dy?: number; scale?: number },
): Px[] {
  if (points.length === 0) return [];
  let cx = 0;
  let cy = 0;
  for (const p of points) {
    cx += p.x;
    cy += p.y;
  }
  cx /= points.length;
  cy /= points.length;
  return points.map((p) => ({
    x: cx + dx + (p.x - cx) * scale,
    y: cy + dy + (p.y - cy) * scale,
  }));
}
