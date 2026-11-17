import { describe, expect, it } from "vitest";
import { newProfile } from "@/modules/profiles/schema";
import {
  actionForHotkey,
  activeAction,
  quickActions,
} from "@/modules/studio/lib/quick-actions";

describe("quick actions", () => {
  it("lists 2D expressions with their own hotkeys", () => {
    const p = newProfile("A", "pngtuber");
    const actions = quickActions(p);
    expect(actions).toHaveLength(1);
    expect(actionForHotkey(p, 1)).toBe(actions[0]?.id);
  });

  it("offers the six moods for 3D avatars on keys 1..6", () => {
    const p = newProfile("B", "vrm");
    expect(quickActions(p).map((a) => a.id)).toEqual([
      "neutral",
      "happy",
      "relaxed",
      "angry",
      "sad",
      "surprised",
    ]);
    expect(actionForHotkey(p, 2)).toBe("happy");
    expect(actionForHotkey(p, 9)).toBeNull();
    expect(activeAction(quickActions(p), null)).toBe("neutral");
  });

  it("has no actions for the 2.5D puppet", () => {
    expect(quickActions(newProfile("C", "puppet"))).toEqual([]);
  });
});
