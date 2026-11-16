import { describe, expect, it } from "vitest";
import {
  nextTalkEnergy,
  pickSlot,
  pngtuberTransform,
  resolveExpression,
} from "@/modules/avatar/pngtuber";
import { expressionSchema, motionSchema } from "@/modules/profiles/schema";
import { idleFrame } from "@/modules/rig/rig";

const full = expressionSchema.parse({
  id: "a",
  name: "A",
  idle: "i",
  talk: "t",
  blink: "b",
  talkBlink: "tb",
});
const idleOnly = expressionSchema.parse({ id: "b", name: "B", idle: "i" });

describe("pickSlot", () => {
  it("uses the exact slot when present", () => {
    expect(pickSlot(full, true, true)).toBe("talkBlink");
    expect(pickSlot(full, true, false)).toBe("talk");
    expect(pickSlot(full, false, true)).toBe("blink");
  });
  it("falls back to idle", () => {
    expect(pickSlot(idleOnly, true, true)).toBe("idle");
  });
  it("returns null for an empty expression", () => {
    expect(
      pickSlot(expressionSchema.parse({ id: "c", name: "C" }), false, false),
    ).toBeNull();
  });
});

describe("expressions", () => {
  it("falls back to the first expression for unknown ids", () => {
    expect(resolveExpression([full, idleOnly], "zzz")?.id).toBe("a");
    expect(resolveExpression([full, idleOnly], "b")?.id).toBe("b");
  });
});

describe("transform", () => {
  it("is neutral at rest", () => {
    const m = motionSchema.parse({ breath: 0 });
    const t = pngtuberTransform(idleFrame(), m, 0, 0);
    expect(t.x).toBeCloseTo(0);
    expect(t.rotate).toBeCloseTo(0);
    expect(t.scaleX).toBeCloseTo(1);
  });
  it("follows roll and yaw", () => {
    const m = motionSchema.parse({});
    const t = pngtuberTransform(
      { ...idleFrame(), roll: 0.3, yaw: 0.3 },
      m,
      0,
      0,
    );
    expect(t.rotate).toBeGreaterThan(0);
    expect(t.x).toBeGreaterThan(0);
  });
  it("talk energy rises then decays", () => {
    const up = nextTalkEnergy(0, true, 50);
    expect(up).toBeGreaterThan(0);
    expect(nextTalkEnergy(up, false, 50)).toBeLessThan(up);
  });
});
