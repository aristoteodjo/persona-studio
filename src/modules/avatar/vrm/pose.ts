import type { Motion, VrmConfig } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

export type Euler = { x: number; y: number; z: number };

/** Target pose for normalized VRM humanoid bones (VRM 1.0 axes: avatar faces +Z). */
export type VrmPose = {
  neck: Euler;
  head: Euler;
  spine: Euler;
  chest: Euler;
  leftUpperArm: Euler;
  rightUpperArm: Euler;
  expressions: Record<string, number>;
};

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);

/**
 * Maps a rig frame onto bones and expression weights. Head rotation is split
 * between neck and head, with a little spine follow so the body feels alive.
 * yaw > 0 turns the nose to screen right (+X), pitch > 0 looks down,
 * roll > 0 tilts clockwise on screen (negative Z for a +Z-facing avatar).
 */
export function vrmPose(
  frame: RigFrame,
  cfg: VrmConfig,
  motion: Motion,
  tMs: number,
): VrmPose {
  const h = motion.head;
  const yaw = frame.yaw * h;
  const pitch = frame.pitch * h;
  const roll = -frame.roll * h;
  const breath = Math.sin(tMs / 900) * 0.025 * motion.breath;
  const talkSway = frame.talking
    ? Math.sin(tMs / 160) * 0.015 * motion.bounce
    : 0;
  const blink = (v: number) => clamp01(v * cfg.eyes);
  return {
    neck: { x: pitch * 0.4, y: yaw * 0.4, z: roll * 0.4 },
    head: { x: pitch * 0.5 + talkSway, y: yaw * 0.5, z: roll * 0.5 },
    spine: { x: breath * 0.5, y: yaw * 0.12, z: roll * 0.1 },
    chest: { x: breath, y: yaw * 0.08, z: 0 },
    leftUpperArm: { x: 0, y: 0, z: -cfg.arms },
    rightUpperArm: { x: 0, y: 0, z: cfg.arms },
    expressions: {
      aa: clamp01(frame.mouthOpen * cfg.mouth),
      blinkLeft: blink(frame.blinkL),
      blinkRight: blink(frame.blinkR),
      happy: clamp01(frame.smile * cfg.emotion * 0.8),
      surprised: clamp01(Math.max(frame.browUp, 0) * cfg.emotion * 0.5),
    },
  };
}

/**
 * three-vrm normalizes VRM 0.x models by turning them 180 degrees around Y,
 * which flips the sense of X and Z rotations for their bones.
 */
export function forMetaVersion(e: Euler, metaVersion: "0" | "1"): Euler {
  return metaVersion === "0" ? { x: -e.x, y: e.y, z: -e.z } : e;
}
