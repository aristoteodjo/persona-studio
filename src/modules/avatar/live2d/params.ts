import type { Live2dConfig, Motion } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

/** Standard Cubism parameter ids; models built from the official template use them. */
export const PARAM = {
  angleX: "ParamAngleX",
  angleY: "ParamAngleY",
  angleZ: "ParamAngleZ",
  bodyX: "ParamBodyAngleX",
  bodyY: "ParamBodyAngleY",
  bodyZ: "ParamBodyAngleZ",
  eyeL: "ParamEyeLOpen",
  eyeR: "ParamEyeROpen",
  eyeSmileL: "ParamEyeLSmile",
  eyeSmileR: "ParamEyeRSmile",
  ballX: "ParamEyeBallX",
  ballY: "ParamEyeBallY",
  browL: "ParamBrowLY",
  browR: "ParamBrowRY",
  mouthOpen: "ParamMouthOpenY",
  mouthForm: "ParamMouthForm",
  breath: "ParamBreath",
} as const;

const DEG = 180 / Math.PI;
const clamp = (v: number, lo: number, hi: number) =>
  Math.min(Math.max(v, lo), hi);

/**
 * Maps a rig frame onto Cubism parameters. AngleX > 0 turns the face to screen
 * right like yaw; AngleY > 0 looks up (pitch > 0 looks down); AngleZ > 0 tilts
 * counterclockwise on screen (roll > 0 is clockwise). ParamEyeL is the model's
 * own left eye, on screen right, like blinkL.
 */
export function live2dParams(
  frame: RigFrame,
  cfg: Live2dConfig,
  motion: Motion,
  tMs: number,
): Record<string, number> {
  const h = motion.head;
  const ax = clamp(frame.yaw * DEG * h, -30, 30);
  const ay = clamp(-frame.pitch * DEG * h, -30, 30);
  const az = clamp(-frame.roll * DEG * h, -30, 30);
  const eye = (blink: number) => clamp(1 - blink * cfg.eyes, 0, 1);
  const smile = clamp(frame.smile, 0, 1);
  return {
    [PARAM.angleX]: ax,
    [PARAM.angleY]: ay,
    [PARAM.angleZ]: az,
    [PARAM.bodyX]: clamp(ax * 0.3 * cfg.body, -10, 10),
    [PARAM.bodyY]: clamp(ay * 0.2 * cfg.body, -10, 10),
    [PARAM.bodyZ]: clamp(az * 0.3 * cfg.body, -10, 10),
    [PARAM.eyeL]: eye(frame.blinkL),
    [PARAM.eyeR]: eye(frame.blinkR),
    [PARAM.eyeSmileL]: smile * 0.6,
    [PARAM.eyeSmileR]: smile * 0.6,
    [PARAM.ballX]: clamp(ax / 30, -1, 1) * 0.4,
    [PARAM.ballY]: clamp(ay / 30, -1, 1) * 0.4,
    [PARAM.browL]: clamp(frame.browUp, -1, 1),
    [PARAM.browR]: clamp(frame.browUp, -1, 1),
    [PARAM.mouthOpen]: clamp(frame.mouthOpen * cfg.mouth, 0, 1),
    [PARAM.mouthForm]: clamp(smile * 2 - 0.3, -1, 1),
    [PARAM.breath]: (Math.sin(tMs / 900) * 0.5 + 0.5) * motion.breath,
  };
}
