import { describe, expect, it } from "vitest";
import {
  encodeFrame,
  encodeProfile,
  parseOverlayMessage,
} from "@/modules/overlay-link/protocol";
import { newProfile } from "@/modules/profiles/schema";
import { idleFrame } from "@/modules/rig/rig";

describe("overlay protocol", () => {
  it("round-trips frames and profiles", () => {
    expect(parseOverlayMessage(encodeFrame(idleFrame(5)))).toEqual({
      type: "frame",
      frame: idleFrame(5),
    });
    const p = newProfile("Test", "pngtuber");
    expect(parseOverlayMessage(encodeProfile(p))).toEqual({
      type: "profile",
      profile: p,
    });
    expect(parseOverlayMessage(encodeProfile(null))).toEqual({
      type: "profile",
      profile: null,
    });
  });

  it("validates webrtc signaling", () => {
    expect(parseOverlayMessage('{"type":"rtc-offer","sdp":"v=0"}')).toEqual({
      type: "rtc-offer",
      sdp: "v=0",
    });
    expect(parseOverlayMessage('{"type":"rtc-close"}')).toEqual({
      type: "rtc-close",
    });
    expect(
      parseOverlayMessage(
        '{"type":"rtc-ice","candidate":{"candidate":"c","sdpMid":"0","sdpMLineIndex":0}}',
      ),
    ).not.toBeNull();
    expect(
      parseOverlayMessage('{"type":"rtc-ice","candidate":{"candidate":5}}'),
    ).toBeNull();
    expect(parseOverlayMessage('{"type":"rtc-offer","sdp":7}')).toBeNull();
  });

  it("drops malformed input", () => {
    expect(parseOverlayMessage("not json")).toBeNull();
    expect(
      parseOverlayMessage('{"type":"frame","frame":{"yaw":"x"}}'),
    ).toBeNull();
    expect(
      parseOverlayMessage('{"type":"profile","profile":{"kind":"evil"}}'),
    ).toBeNull();
    expect(parseOverlayMessage('{"type":"other"}')).toBeNull();
  });
});
