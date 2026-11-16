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
