/**
 * Arm and finger tracking, expressed in avatar space: X = screen right
 * (the avatar's left side), Y = up, Z = toward the camera.
 */

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export type ArmSide = {
  /** Unit direction shoulder -> elbow. */
  upper: Vec3;
  /** Unit direction elbow -> wrist. */
  lower: Vec3;
  /** Flexion of thumb, index, middle, ring and little finger, 0 open .. 1 fist. */
  curl: [number, number, number, number, number] | null;
};

/** `left` / `right` are the avatar's own arms (screen right / screen left). */
export type ArmPose = { left: ArmSide | null; right: ArmSide | null };

export type Landmark = { x: number; y: number; z: number; visibility?: number };

const POSE = {
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
} as const;

const MIN_VISIBILITY = 0.6;

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const len = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);

export function normalize(a: Vec3): Vec3 | null {
  const l = len(a);
  return l < 1e-6 ? null : [a[0] / l, a[1] / l, a[2] / l];
}

/** Shortest rotation taking unit vector `from` onto unit vector `to`. */
export function quatFromUnitVectors(from: Vec3, to: Vec3): Quat {
  const d = dot(from, to);
  if (d < -0.999999) {
    // Opposite vectors: rotate 180 degrees around any axis orthogonal to `from`.
    const axis = normalize(cross([0, 1, 0], from)) ??
      normalize(cross([0, 0, 1], from)) ?? [1, 0, 0];
    return [axis[0], axis[1], axis[2], 0];
  }
  const c = cross(from, to);
  const q: Quat = [c[0], c[1], c[2], 1 + d];
  const l = Math.hypot(...q);
  return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
}

/** Rotates v by the inverse of unit quaternion q. */
export function rotateInverse(q: Quat, v: Vec3): Vec3 {
  const u: Vec3 = [-q[0], -q[1], -q[2]];
  const w = q[3];
  const t = cross(u, v).map((x) => 2 * x) as Vec3;
  const ut = cross(u, t);
  return [
    v[0] + w * t[0] + ut[0],
    v[1] + w * t[1] + ut[1],
    v[2] + w * t[2] + ut[2],
  ];
}

/** Pose world landmarks (image-aligned, meters) to avatar space. */
function toAvatar(p: Landmark, mirror: boolean): Vec3 {
  return [mirror ? -p.x : p.x, -p.y, -p.z];
}

function side(
  lm: readonly Landmark[],
  shoulder: number,
  elbow: number,
  wrist: number,
  mirror: boolean,
): Omit<ArmSide, "curl"> | null {
  const s = lm[shoulder];
  const e = lm[elbow];
  const w = lm[wrist];
  if (!s || !e || !w) return null;
  if (
    (e.visibility ?? 0) < MIN_VISIBILITY ||
    (w.visibility ?? 0) < MIN_VISIBILITY
  ) {
    return null;
  }
  const upper = normalize(sub(toAvatar(e, mirror), toAvatar(s, mirror)));
  const lower = normalize(sub(toAvatar(w, mirror), toAvatar(e, mirror)));
  return upper && lower ? { upper, lower } : null;
}

/**
 * The avatar arm on screen right mirrors the subject's right arm when the view
 * is mirrored, and the subject's left arm otherwise.
 */
export function armsFromPose(
  world: readonly Landmark[],
  mirror: boolean,
): { left: Omit<ArmSide, "curl"> | null; right: Omit<ArmSide, "curl"> | null } {
  const subjectRight = side(
    world,
    POSE.rightShoulder,
    POSE.rightElbow,
    POSE.rightWrist,
    mirror,
  );
  const subjectLeft = side(
    world,
    POSE.leftShoulder,
    POSE.leftElbow,
    POSE.leftWrist,
    mirror,
  );
  return mirror
    ? { left: subjectRight, right: subjectLeft }
    : { left: subjectLeft, right: subjectRight };
}

/** Pose wrist positions in image space, keyed by avatar side, to pair detected hands. */
export function avatarWrists(
  image: readonly Landmark[],
  mirror: boolean,
): { left: Landmark | null; right: Landmark | null } {
  const subjectRight = image[POSE.rightWrist] ?? null;
  const subjectLeft = image[POSE.leftWrist] ?? null;
  return mirror
    ? { left: subjectRight, right: subjectLeft }
    : { left: subjectLeft, right: subjectRight };
}

const FINGERS: [number, number, number, number][] = [
  [1, 2, 3, 4],
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20],
];

/** Finger flexion from the 21 hand landmarks: sum of the joint bend angles. */
export function fingerCurls(hand: readonly Landmark[]): ArmSide["curl"] {
  const wrist = hand[0];
  if (!wrist || hand.length < 21) return null;
  const v = (p: Landmark): Vec3 => [p.x, p.y, p.z];
  const out = FINGERS.map((joints, f) => {
    const pts = [wrist, ...joints.map((j) => hand[j])];
    let bend = 0;
    for (let i = 1; i < pts.length - 1; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const c = pts[i + 1];
      if (!a || !b || !c) return 0;
      const s1 = normalize(sub(v(b), v(a)));
      const s2 = normalize(sub(v(c), v(b)));
      if (!s1 || !s2) continue;
      bend += Math.acos(Math.min(Math.max(dot(s1, s2), -1), 1));
    }
    // A thumb bends less than a finger before it reads as closed.
    const full = f === 0 ? 1.6 : 3.2;
    return Math.min(Math.max((bend - 0.25) / full, 0), 1);
  });
  return out as ArmSide["curl"];
}

export type ArmRotations = { upper: Quat; lower: Quat };

/**
 * Normalized VRM bones rest in T-pose: the avatar's left arm points to +X,
 * its right arm to -X. The forearm rotation is relative to the upper arm.
 */
export function armRotations(
  arm: ArmSide,
  which: "left" | "right",
): ArmRotations {
  const rest: Vec3 = which === "left" ? [1, 0, 0] : [-1, 0, 0];
  const upper = quatFromUnitVectors(rest, arm.upper);
  const local = normalize(rotateInverse(upper, arm.lower)) ?? rest;
  return { upper, lower: quatFromUnitVectors(rest, local) };
}

/** three-vrm turns VRM 0.x models 180 degrees around Y, which flips X and Z. */
export function quatForMetaVersion(q: Quat, metaVersion: "0" | "1"): Quat {
  return metaVersion === "0" ? [-q[0], q[1], -q[2], q[3]] : q;
}

const isVec = (v: unknown, n: number) =>
  Array.isArray(v) &&
  v.length === n &&
  v.every((x) => typeof x === "number" && Number.isFinite(x));

function isSide(v: unknown): v is ArmSide | null {
  if (v === null) return true;
  if (typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return (
    isVec(s.upper, 3) &&
    isVec(s.lower, 3) &&
    (s.curl === null || isVec(s.curl, 5))
  );
}

export function isArmPose(v: unknown): v is ArmPose | null {
  if (v === null || v === undefined) return true;
  if (typeof v !== "object") return false;
  const a = v as Record<string, unknown>;
  return isSide(a.left) && isSide(a.right);
}
