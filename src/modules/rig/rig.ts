import type { ArmPose } from "@/modules/rig/gestures";
import { LM } from "@/modules/rig/landmarks";

/**
 * Everything an avatar needs to animate one frame. Angles are in radians and
 * already expressed in screen terms: yaw > 0 turns the nose toward screen right,
 * pitch > 0 tilts it down, roll > 0 rotates clockwise. blinkL / blinkR target
 * the avatar's own left / right eye (the screen-right / screen-left eye).
 */
export type RigFrame = {
  t: number;
  face: boolean;
  yaw: number;
  pitch: number;
  roll: number;
  x: number;
  y: number;
  mouthOpen: number;
  blinkL: number;
  blinkR: number;
  browUp: number;
  smile: number;
  talking: boolean;
  voice: number;
  expressionId: string | null;
  /** Tracked arms and fingers, null when the hands are out of view or gestures are off. */
  arms: ArmPose | null;
};

export type HeadPose = {
  yaw: number;
  pitch: number;
  roll: number;
  x: number;
  y: number;
  pitchRatio: number;
};

export type FaceSignals = HeadPose & {
  jaw: number;
  blinkL: number;
  blinkR: number;
  browUp: number;
  smile: number;
};

export type Calibration = Pick<
  HeadPose,
  "yaw" | "pitch" | "roll" | "x" | "y" | "pitchRatio"
>;

export type Point = { x: number; y: number; z?: number };

export const NEUTRAL_CALIBRATION: Calibration = {
  yaw: 0,
  pitch: 0,
  roll: 0,
  x: 0,
  y: 0,
  pitchRatio: 0.5,
};

export function idleFrame(t = 0): RigFrame {
  return {
    t,
    face: false,
    yaw: 0,
    pitch: 0,
    roll: 0,
    x: 0,
    y: 0,
    mouthOpen: 0,
    blinkL: 0,
    blinkR: 0,
    browUp: 0,
    smile: 0,
    talking: false,
    voice: 0,
    expressionId: null,
    arms: null,
  };
}

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

export const remap = (v: number, from: number, to: number) =>
  clamp((v - from) / (to - from), 0, 1);

const MAX_YAW = 0.7;
const MAX_PITCH = 0.6;
const MAX_ROLL = 0.6;

/**
 * Head pose from raw (unmirrored) landmarks in pixel space. Uses only 2D
 * geometry so the sign conventions stay obvious and testable.
 */
export function headPoseFromLandmarks(
  lm: readonly Point[],
  width: number,
  height: number,
): HeadPose | null {
  const p = (i: number) => {
    const v = lm[i];
    return v ? { x: v.x * width, y: v.y * height } : null;
  };
  const nose = p(LM.noseTip);
  const bridge = p(LM.noseBridge);
  const cheekR = p(LM.cheekRight);
  const cheekL = p(LM.cheekLeft);
  const eyeR = p(LM.eyeRightOuter);
  const eyeL = p(LM.eyeLeftOuter);
  const mouthTop = p(LM.upperLipInnerMid);
  if (!nose || !bridge || !cheekR || !cheekL || !eyeR || !eyeL || !mouthTop) {
    return null;
  }

  // Subject's right eye sits on image left: the eye line points to image right.
  const roll = Math.atan2(eyeL.y - eyeR.y, eyeL.x - eyeR.x);
  const midX = (cheekR.x + cheekL.x) / 2;
  const halfWidth = Math.hypot(cheekL.x - cheekR.x, cheekL.y - cheekR.y) / 2;
  if (halfWidth < 1) return null;
  const yaw = Math.asin(clamp((nose.x - midX) / halfWidth, -1, 1));

  const eyeMidY = (eyeR.y + eyeL.y) / 2;
  const span = mouthTop.y - eyeMidY;
  const pitchRatio = span > 1 ? (nose.y - eyeMidY) / span : 0.5;

  return {
    yaw,
    pitch: 0,
    roll,
    x: (bridge.x / width) * 2 - 1,
    y: (bridge.y / height) * 2 - 1,
    pitchRatio,
  };
}

export function faceSignals(
  lm: readonly Point[],
  blendshapes: Readonly<Record<string, number>>,
  width: number,
  height: number,
): FaceSignals | null {
  const pose = headPoseFromLandmarks(lm, width, height);
  if (!pose) return null;
  const b = (k: string) => blendshapes[k] ?? 0;
  return {
    ...pose,
    jaw: b("jawOpen"),
    blinkL: b("eyeBlinkLeft"),
    blinkR: b("eyeBlinkRight"),
    browUp: b("browInnerUp") - (b("browDownLeft") + b("browDownRight")) / 2,
    smile: (b("mouthSmileLeft") + b("mouthSmileRight")) / 2,
  };
}

export type RigOptions = {
  mirror: boolean;
  calibration: Calibration;
};

/** Converts raw camera-space signals into avatar-space angles and amounts. */
export function signalsToFace(
  s: FaceSignals,
  { mirror, calibration: c }: RigOptions,
) {
  const flip = mirror ? -1 : 1;
  const pitch = clamp(
    (s.pitchRatio - c.pitchRatio) * 2.4,
    -MAX_PITCH,
    MAX_PITCH,
  );
  return {
    yaw: clamp((s.yaw - c.yaw) * flip, -MAX_YAW, MAX_YAW),
    pitch,
    roll: clamp((s.roll - c.roll) * flip, -MAX_ROLL, MAX_ROLL),
    x: clamp((s.x - c.x) * flip, -1, 1),
    y: clamp(s.y - c.y, -1, 1),
    mouthOpen: remap(s.jaw, 0.06, 0.5),
    blinkL: remap(mirror ? s.blinkR : s.blinkL, 0.3, 0.6),
    blinkR: remap(mirror ? s.blinkL : s.blinkR, 0.3, 0.6),
    browUp: clamp(s.browUp * 1.6, -1, 1),
    smile: remap(s.smile, 0.15, 0.7),
  };
}

export function calibrationFrom(s: FaceSignals): Calibration {
  return {
    yaw: s.yaw,
    pitch: 0,
    roll: s.roll,
    x: s.x,
    y: s.y,
    pitchRatio: s.pitchRatio,
  };
}

/** Frame-rate independent exponential smoothing; tau in ms, 0 disables it. */
export function smoothFactor(dtMs: number, tauMs: number): number {
  if (tauMs <= 0) return 1;
  return 1 - Math.exp(-Math.max(dtMs, 0) / tauMs);
}

const SMOOTHED: (keyof RigFrame)[] = [
  "yaw",
  "pitch",
  "roll",
  "x",
  "y",
  "mouthOpen",
  "blinkL",
  "blinkR",
  "browUp",
  "smile",
  "voice",
];

export function smoothFrame(
  prev: RigFrame,
  next: RigFrame,
  tauMs: number,
): RigFrame {
  const out = { ...next };
  const k = smoothFactor(next.t - prev.t, tauMs);
  for (const key of SMOOTHED) {
    // Blinks must stay snappy or they never fully close.
    const kk = key === "blinkL" || key === "blinkR" ? Math.max(k, 0.6) : k;
    const a = prev[key] as number;
    const b = next[key] as number;
    (out[key] as number) = a + (b - a) * kk;
  }
  return out;
}

export type TalkState = { talking: boolean; lastLoud: number };

/** Voice activity with hysteresis and a hold time so syllables do not flicker the mouth. */
export function updateTalk(
  state: TalkState,
  level: number,
  now: number,
  threshold: number,
  holdMs = 160,
): TalkState {
  if (level >= threshold) return { talking: true, lastLoud: now };
  if (state.talking && level >= threshold * 0.7) {
    return { talking: true, lastLoud: now };
  }
  if (state.talking && now - state.lastLoud < holdMs) return state;
  return { talking: false, lastLoud: state.lastLoud };
}

/** Converts an RMS amplitude to a 0..1 level on a -60..-10 dBFS scale. */
export function rmsToLevel(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return remap(db, -60, -10);
}

/** Natural blink pattern for when no camera drives the eyes. */
export function autoBlink(tMs: number): number {
  const period = 4200;
  const phase = tMs % period;
  const jitter = (Math.floor(tMs / period) * 977) % 1300;
  const start = 2400 + jitter * 0.6;
  const d = phase - start;
  if (d < 0 || d > 140) return 0;
  return Math.sin((d / 140) * Math.PI);
}
