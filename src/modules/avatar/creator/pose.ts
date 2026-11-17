import type { Vec3 } from "@/modules/avatar/creator/spec";
import type { CreatorConfig, Motion } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

export type CreatorPose = {
  /** Euler XYZ of the head group (avatar faces +Z toward the camera). */
  head: Vec3;
  body: Vec3;
  /** Vertical scale of each eye group: 1 open, near 0 closed. */
  eyeL: number;
  eyeR: number;
  mouth: { x: number; y: number };
  brow: number;
  breath: number;
  bounce: number;
};

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

/**
 * yaw > 0 turns the nose to screen right (+Y rotation brings +Z toward +X),
 * pitch > 0 looks down (+X rotation), roll > 0 tilts clockwise on screen,
 * which is a negative Z rotation seen from the camera.
 */
export function creatorPose(
  frame: RigFrame,
  cfg: CreatorConfig,
  motion: Motion,
  tMs: number,
): CreatorPose {
  const h = motion.head;
  const yaw = clamp(frame.yaw * h, -0.9, 0.9);
  const pitch = clamp(frame.pitch * h, -0.7, 0.7);
  const roll = clamp(-frame.roll * h, -0.7, 0.7);
  const eye = (blink: number) => clamp(1 - blink * cfg.eyesAmount, 0.06, 1);
  const open = clamp(frame.mouthOpen * cfg.mouth, 0, 1);
  const smile = clamp(frame.smile, 0, 1);
  return {
    head: [pitch, yaw, roll],
    body: [pitch * 0.15, yaw * 0.25, roll * 0.2],
    eyeL: eye(frame.blinkL),
    eyeR: eye(frame.blinkR),
    mouth: { x: 1 + smile * 0.6 - open * 0.15, y: 0.35 + open * 2.6 },
    brow: clamp(frame.browUp, -1, 1) * 0.012,
    breath: Math.sin(tMs / 900) * 0.012 * motion.breath,
    bounce: frame.talking
      ? Math.abs(Math.sin(tMs / 140)) * 0.006 * motion.bounce
      : 0,
  };
}
