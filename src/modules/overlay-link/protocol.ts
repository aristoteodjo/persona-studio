import { type Profile, profileSchema } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

export type OverlayMessage =
  | { type: "profile"; profile: Profile | null }
  | { type: "frame"; frame: RigFrame };

const NUMERIC: (keyof RigFrame)[] = [
  "t",
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

function isFrame(v: unknown): v is RigFrame {
  if (typeof v !== "object" || v === null) return false;
  const f = v as Record<string, unknown>;
  return (
    NUMERIC.every((k) => typeof f[k] === "number" && Number.isFinite(f[k])) &&
    typeof f.talking === "boolean" &&
    typeof f.face === "boolean" &&
    (f.expressionId === null || typeof f.expressionId === "string")
  );
}

/** Overlay input crosses a network boundary: anything malformed is dropped. */
export function parseOverlayMessage(raw: string): OverlayMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const msg = data as Record<string, unknown>;
  if (msg.type === "frame") {
    return isFrame(msg.frame) ? { type: "frame", frame: msg.frame } : null;
  }
  if (msg.type === "profile") {
    if (msg.profile === null) return { type: "profile", profile: null };
    const parsed = profileSchema.safeParse(msg.profile);
    return parsed.success ? { type: "profile", profile: parsed.data } : null;
  }
  return null;
}

export const encodeFrame = (frame: RigFrame) =>
  JSON.stringify({ type: "frame", frame } satisfies OverlayMessage);

export const encodeProfile = (profile: Profile | null) =>
  JSON.stringify({ type: "profile", profile } satisfies OverlayMessage);
