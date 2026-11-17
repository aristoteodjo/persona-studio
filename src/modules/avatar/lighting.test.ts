import { describe, expect, it } from "vitest";
import { backgroundCss, LIGHT_RIGS } from "@/modules/avatar/lighting";
import { sceneSchema } from "@/modules/profiles/schema";

describe("décor", () => {
  const scene = sceneSchema.parse({});
  it("is transparent by default", () => {
    expect(backgroundCss(scene, null)).toBeNull();
  });
  it("renders colors, gradients and images", () => {
    expect(
      backgroundCss(
        {
          ...scene,
          background: { ...scene.background, kind: "color", color: "#112233" },
        },
        null,
      ),
    ).toBe("#112233");
    expect(
      backgroundCss(
        { ...scene, background: { ...scene.background, kind: "gradient" } },
        null,
      ),
    ).toContain("linear-gradient(160deg");
    expect(
      backgroundCss(
        { ...scene, background: { ...scene.background, kind: "image" } },
        "http://x/a.png",
      ),
    ).toContain('url("http://x/a.png")');
    expect(
      backgroundCss(
        { ...scene, background: { ...scene.background, kind: "image" } },
        null,
      ),
    ).toBe(scene.background.color);
  });
  it("defines every lighting mood", () => {
    for (const rig of Object.values(LIGHT_RIGS))
      expect(rig.key.intensity).toBeGreaterThan(0);
  });
});
