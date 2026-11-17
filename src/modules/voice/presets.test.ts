import { describe, expect, it } from "vitest";
import { voiceChangerSchema } from "@/modules/profiles/schema";
import {
  CUSTOM_PRESET,
  semitonesToRatio,
  updateShout,
  VOICE_PRESETS,
  withFx,
  withPreset,
} from "@/modules/voice/presets";

const base = voiceChangerSchema.parse({});

describe("voice presets", () => {
  it("every preset stays inside the schema bounds", () => {
    for (const p of VOICE_PRESETS) {
      expect(
        voiceChangerSchema.safeParse({ ...base, ...p.fx, preset: p.id })
          .success,
      ).toBe(true);
    }
  });

  it("applies a preset and switches to custom on manual edits", () => {
    const robot = withPreset(base, "robot");
    expect(robot.robot).toBeGreaterThan(0.5);
    expect(robot.preset).toBe("robot");
    expect(withFx(robot, { echo: 0.2 }).preset).toBe(CUSTOM_PRESET);
    expect(withPreset(base, "nope")).toBe(base);
  });

  it("converts semitones to a playback ratio", () => {
    expect(semitonesToRatio(12)).toBeCloseTo(2);
    expect(semitonesToRatio(-12)).toBeCloseTo(0.5);
    expect(semitonesToRatio(0)).toBe(1);
  });
});

describe("shout", () => {
  it("holds briefly after a loud burst", () => {
    let s = updateShout({ shouting: false, lastLoud: 0 }, 0.9, 0, 0.85);
    expect(s.shouting).toBe(true);
    s = updateShout(s, 0.2, 300, 0.85);
    expect(s.shouting).toBe(true);
    s = updateShout(s, 0.2, 700, 0.85);
    expect(s.shouting).toBe(false);
  });
});
