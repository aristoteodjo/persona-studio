import { type Profile, profileSchema } from "@/modules/profiles/schema";
import { isArmPose } from "@/modules/rig/gestures";
import type { RigFrame } from "@/modules/rig/rig";

export type IceCandidate = {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
};

/** WebRTC signaling, studio <-> one overlay, used to carry the changed voice. */
export type RtcMessage =
  | { type: "rtc-offer"; sdp: string }
  | { type: "rtc-answer"; sdp: string }
  | { type: "rtc-ice"; candidate: IceCandidate }
  | { type: "rtc-close" };

export type OverlayMessage =
  | { type: "profile"; profile: Profile | null }
  | { type: "frame"; frame: RigFrame }
  | RtcMessage;

const MAX_SDP = 32 * 1024;

function isCandidate(v: unknown): v is IceCandidate {
  if (typeof v !== "object" || v === null) return false;
  const c = v as Record<string, unknown>;
  return (
    typeof c.candidate === "string" &&
    c.candidate.length < 2048 &&
    (c.sdpMid === null || typeof c.sdpMid === "string") &&
    (c.sdpMLineIndex === null || typeof c.sdpMLineIndex === "number")
  );
}

/** Signaling crosses the local server in both directions; validate before touching WebRTC. */
export function parseRtcMessage(data: unknown): RtcMessage | null {
  if (typeof data !== "object" || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "rtc-offer":
    case "rtc-answer":
      return typeof m.sdp === "string" && m.sdp.length < MAX_SDP
        ? { type: m.type, sdp: m.sdp }
        : null;
    case "rtc-ice":
      return isCandidate(m.candidate)
        ? { type: "rtc-ice", candidate: m.candidate }
        : null;
    case "rtc-close":
      return { type: "rtc-close" };
    default:
      return null;
  }
}

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
    (f.expressionId === null || typeof f.expressionId === "string") &&
    isArmPose(f.arms)
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
    return isFrame(msg.frame)
      ? { type: "frame", frame: { ...msg.frame, arms: msg.frame.arms ?? null } }
      : null;
  }
  if (msg.type === "profile") {
    if (msg.profile === null) return { type: "profile", profile: null };
    const parsed = profileSchema.safeParse(msg.profile);
    return parsed.success ? { type: "profile", profile: parsed.data } : null;
  }
  return parseRtcMessage(msg);
}

export const encodeFrame = (frame: RigFrame) =>
  JSON.stringify({ type: "frame", frame } satisfies OverlayMessage);

export const encodeProfile = (profile: Profile | null) =>
  JSON.stringify({ type: "profile", profile } satisfies OverlayMessage);
