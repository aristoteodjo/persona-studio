import type {
  Expression,
  ExpressionSlot,
  Motion,
} from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

/** Picks the best available image, falling back so a half-filled expression still renders. */
export function pickSlot(
  e: Expression,
  talking: boolean,
  blinking: boolean,
): ExpressionSlot | null {
  const order: ExpressionSlot[] =
    talking && blinking
      ? ["talkBlink", "talk", "blink", "idle"]
      : talking
        ? ["talk", "idle"]
        : blinking
          ? ["blink", "idle"]
          : ["idle"];
  return order.find((s) => e[s] !== null) ?? null;
}

export function resolveExpression(
  expressions: readonly Expression[],
  id: string | null,
): Expression | null {
  return expressions.find((e) => e.id === id) ?? expressions[0] ?? null;
}

export type AvatarTransform = {
  x: number;
  y: number;
  rotate: number;
  scaleX: number;
  scaleY: number;
};

/**
 * Whole-image motion for flat avatars. Distances are fractions of the avatar
 * height so the same profile looks identical at any stage size.
 */
export function pngtuberTransform(
  frame: RigFrame,
  motion: Motion,
  talkEnergy: number,
  tMs: number,
): AvatarTransform {
  const h = motion.head;
  const bounce =
    -Math.abs(Math.sin(tMs / 110)) * 0.035 * motion.bounce * talkEnergy;
  const breath = Math.sin(tMs / 900) * 0.006 * motion.breath;
  const turn = frame.yaw * h;
  return {
    x: motion.offsetX * 0.5 + turn * 0.12 + frame.x * 0.08 * h,
    y: motion.offsetY * 0.5 + frame.pitch * 0.06 * h + bounce,
    rotate: frame.roll * 0.8 * h,
    // Squash the image slightly on yaw to fake a head turn on a flat drawing.
    scaleX: motion.scale * (1 - Math.abs(turn) * 0.08) * (1 + breath),
    scaleY: motion.scale * (1 - breath * 0.5),
  };
}

/** Eases talk energy up fast and down slowly so the bounce settles naturally. */
export function nextTalkEnergy(
  prev: number,
  talking: boolean,
  dtMs: number,
): number {
  const target = talking ? 1 : 0;
  const tau = talking ? 60 : 220;
  return prev + (target - prev) * (1 - Math.exp(-Math.max(dtMs, 0) / tau));
}
