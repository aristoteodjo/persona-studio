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

/** Hysteresis: an arm must be clearly visible to start tracking, and lost to stop. */
const ENTER_VISIBILITY = 0.75;
const STAY_VISIBILITY = 0.45;
/** Monocular depth is the noisiest axis; damping it keeps arms from flailing toward the camera. */
const DEPTH_SCALE = 0.5;
/** How far an arm may cross the body's midline (unit direction X), so it never goes through the torso. */
const MAX_UPPER_INWARD = 0.25;
const MAX_LOWER_INWARD = 0.45;

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
  return [mirror ? -p.x : p.x, -p.y, -p.z * DEPTH_SCALE];
}

/** A detected hand must sit this close (image units) to a wrist to confirm it. */
const HAND_PAIR_DISTANCE = 0.15;
/** Pose guesses arms below the frame with high confidence; a wrist must be on screen. */
const FRAME_MARGIN = 0.02;

type Point2 = { x: number; y: number };

const inFrame = (p: Landmark | undefined) =>
  !!p &&
  p.x > FRAME_MARGIN &&
  p.x < 1 - FRAME_MARGIN &&
  p.y > FRAME_MARGIN &&
  p.y < 1 - FRAME_MARGIN;

const near = (a: Point2, b: Point2) =>
  Math.hypot(a.x - b.x, a.y - b.y) < HAND_PAIR_DISTANCE;

/**
 * Pose sometimes labels the body sides backwards. Someone facing the camera
 * always has their right shoulder on the image left, so geometry decides.
 */
export function sidesSwapped(image: readonly Landmark[] | undefined): boolean {
  const l = image?.[POSE.leftShoulder];
  const r = image?.[POSE.rightShoulder];
  return !!l && !!r && l.x < r.x;
}

type Joints = { shoulder: number; elbow: number; wrist: number };
const SUBJECT_LEFT: Joints = {
  shoulder: POSE.leftShoulder,
  elbow: POSE.leftElbow,
  wrist: POSE.leftWrist,
};
const SUBJECT_RIGHT: Joints = {
  shoulder: POSE.rightShoulder,
  elbow: POSE.rightElbow,
  wrist: POSE.rightWrist,
};

/** Joint indices of the subject's real left and right arms. */
function subjectJoints(image: readonly Landmark[] | undefined) {
  return sidesSwapped(image)
    ? { left: SUBJECT_RIGHT, right: SUBJECT_LEFT }
    : { left: SUBJECT_LEFT, right: SUBJECT_RIGHT };
}

export type ArmEvidence = {
  /** Image-space landmarks of the same pose, for side and framing checks. */
  image?: readonly Landmark[];
  /** Image-space wrists of the hands the hand model found. */
  hands?: readonly Point2[];
};

function side(
  lm: readonly Landmark[],
  j: Joints,
  mirror: boolean,
  tracked: boolean,
  evidence: ArmEvidence,
): Omit<ArmSide, "curl"> | null {
  const s = lm[j.shoulder];
  const e = lm[j.elbow];
  const w = lm[j.wrist];
  if (!s || !e || !w) return null;
  const min = tracked ? STAY_VISIBILITY : ENTER_VISIBILITY;
  if ((e.visibility ?? 0) < min || (w.visibility ?? 0) < min) {
    return null;
  }
  if (evidence.image) {
    const wrist = evidence.image[j.wrist];
    if (!inFrame(wrist)) return null;
    // Starting needs a real hand there; a tracked arm survives missed hand frames.
    if (
      !tracked &&
      evidence.hands &&
      !evidence.hands.some((h) => wrist && near(h, wrist))
    ) {
      return null;
    }
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
  tracked: { left: boolean; right: boolean } = { left: false, right: false },
  evidence: ArmEvidence = {},
): { left: Omit<ArmSide, "curl"> | null; right: Omit<ArmSide, "curl"> | null } {
  const joints = subjectJoints(evidence.image);
  // With a mirrored view the subject's right arm drives the avatar's left one.
  const subjectRight = side(
    world,
    joints.right,
    mirror,
    mirror ? tracked.left : tracked.right,
    evidence,
  );
  const subjectLeft = side(
    world,
    joints.left,
    mirror,
    mirror ? tracked.right : tracked.left,
    evidence,
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
  const joints = subjectJoints(image);
  const subjectRight = image[joints.right.wrist] ?? null;
  const subjectLeft = image[joints.left.wrist] ?? null;
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
/** Keeps a direction from crossing the midline further than `limit` (outward is +X for the left arm). */
function limitInward(v: Vec3, which: "left" | "right", limit: number): Vec3 {
  const outward = which === "left" ? v[0] : -v[0];
  if (outward >= -limit) return v;
  const x = which === "left" ? -limit : limit;
  // Keep the inward part bounded and give the rest of the length to Y/Z;
  // a direction pointing straight inward falls back to hanging down.
  const rest = Math.sqrt(1 - limit * limit);
  const yz = Math.hypot(v[1], v[2]);
  return yz < 1e-3
    ? [x, -rest, 0]
    : [x, (v[1] / yz) * rest, (v[2] / yz) * rest];
}

/**
 * Rough humanoid proportions in meters, avatar space, origin between the
 * shoulders: enough to keep elbows and hands in front of the chest.
 */
const BODY = {
  shoulderX: 0.17,
  upper: 0.27,
  fore: 0.25,
  torsoHalfWidth: 0.15,
  torsoTop: 0.05,
  torsoBottom: -0.6,
  torsoFront: 0.12,
};

const insideTorso = (p: Vec3) =>
  Math.abs(p[0]) < BODY.torsoHalfWidth &&
  p[1] < BODY.torsoTop &&
  p[1] > BODY.torsoBottom &&
  p[2] < BODY.torsoFront;

/** Tilts a unit direction toward the camera until its Z reaches `minZ`, keeping its X/Y heading. */
function withMinZ(v: Vec3, minZ: number): Vec3 {
  const z = Math.min(Math.max(minZ, -1), 1);
  if (v[2] >= z) return v;
  const rest = Math.sqrt(1 - z * z);
  const xy = Math.hypot(v[0], v[1]);
  return xy < 1e-3
    ? [0, -rest, z]
    : [(v[0] / xy) * rest, (v[1] / xy) * rest, z];
}

const along = (from: Vec3, dir: Vec3, length: number): Vec3 => [
  from[0] + dir[0] * length,
  from[1] + dir[1] * length,
  from[2] + dir[2] * length,
];

/** Monocular depth puts hands inside the chest; push elbow and hand out in front of it. */
export function avoidTorso(
  upper: Vec3,
  lower: Vec3,
  which: "left" | "right",
): { upper: Vec3; lower: Vec3 } {
  const shoulder: Vec3 = [
    which === "left" ? BODY.shoulderX : -BODY.shoulderX,
    0,
    0,
  ];
  let u = upper;
  if (insideTorso(along(shoulder, u, BODY.upper))) {
    u = withMinZ(u, BODY.torsoFront / BODY.upper);
  }
  const elbow = along(shoulder, u, BODY.upper);
  let l = lower;
  if (
    insideTorso(along(elbow, l, BODY.fore)) ||
    insideTorso(along(elbow, l, BODY.fore / 2))
  ) {
    l = withMinZ(l, (BODY.torsoFront - elbow[2]) / BODY.fore);
  }
  return { upper: u, lower: l };
}

export function armRotations(
  arm: ArmSide,
  which: "left" | "right",
): ArmRotations {
  const rest: Vec3 = which === "left" ? [1, 0, 0] : [-1, 0, 0];
  const safe = avoidTorso(
    limitInward(arm.upper, which, MAX_UPPER_INWARD),
    limitInward(arm.lower, which, MAX_LOWER_INWARD),
    which,
  );
  const upper = quatFromUnitVectors(rest, safe.upper);
  const local = normalize(rotateInverse(upper, safe.lower)) ?? rest;
  return { upper, lower: quatFromUnitVectors(rest, local) };
}

/** Below this change (about 2.5 degrees) a direction is treated as noise and held. */
const DEADZONE_COS = 0.999;

function smoothDir(prev: Vec3, next: Vec3, k: number): Vec3 {
  if (dot(prev, next) > DEADZONE_COS) return prev;
  return (
    normalize([
      prev[0] + (next[0] - prev[0]) * k,
      prev[1] + (next[1] - prev[1]) * k,
      prev[2] + (next[2] - prev[2]) * k,
    ]) ?? next
  );
}

function smoothSide(
  prev: ArmSide | null,
  next: ArmSide | null,
  k: number,
): ArmSide | null {
  if (!next || !prev) return next;
  const curl =
    next.curl && prev.curl
      ? (next.curl.map((c, i) => {
          const p = prev.curl?.[i] ?? c;
          return Math.abs(c - p) < 0.04 ? p : p + (c - p) * k;
        }) as ArmSide["curl"])
      : next.curl;
  return {
    upper: smoothDir(prev.upper, next.upper, k),
    lower: smoothDir(prev.lower, next.lower, k),
    curl,
  };
}

/** Frame-rate independent low-pass with a dead zone, so a still arm stays still. */
export function smoothArms(
  prev: ArmPose | null,
  next: ArmPose | null,
  dtMs: number,
  tauMs = 140,
): ArmPose | null {
  if (!next) return null;
  const k = 1 - Math.exp(-Math.max(dtMs, 0) / tauMs);
  return {
    left: smoothSide(prev?.left ?? null, next.left, k),
    right: smoothSide(prev?.right ?? null, next.right, k),
  };
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
