import { describe, expect, it } from "vitest";
import { buildCreatorSpec, shade } from "@/modules/avatar/creator/spec";
import {
  CREATOR_ACCESSORIES,
  CREATOR_HAIR,
  CREATOR_OUTFITS,
  creatorSchema,
} from "@/modules/profiles/schema";

const base = creatorSchema.parse({});
const HEX = /^#[0-9a-f]{6}$/i;

describe("creator spec", () => {
  it("only produces valid parts in known groups", () => {
    for (const style of CREATOR_HAIR) {
      for (const outfit of CREATOR_OUTFITS) {
        const spec = buildCreatorSpec({
          ...base,
          hair: { ...base.hair, style },
          outfit: { ...base.outfit, style: outfit },
          accessories: [...CREATOR_ACCESSORIES],
        });
        const ids = new Set<string>();
        for (const p of spec.parts) {
          expect(spec.groups[p.group]).toBeDefined();
          expect(p.dims.every((d) => d > 0 && Number.isFinite(d))).toBe(true);
          expect(p.color).toMatch(HEX);
          expect(ids.has(p.id)).toBe(false);
          ids.add(p.id);
        }
      }
    }
  });

  it("changes the silhouette with the hair style", () => {
    const ids = (style: (typeof CREATOR_HAIR)[number]) =>
      buildCreatorSpec({ ...base, hair: { ...base.hair, style } })
        .parts.filter((p) => p.id.startsWith("hair."))
        .map((p) => `${p.id}:${p.shape}:${p.dims.join("/")}`)
        .join();
    expect(new Set(CREATOR_HAIR.map(ids)).size).toBe(CREATOR_HAIR.length);
  });

  it("colors the irises and mirrors the eyes", () => {
    const spec = buildCreatorSpec({
      ...base,
      eyes: { ...base.eyes, color: "#12ab34" },
    });
    const iris = spec.parts.filter((p) => p.id.endsWith(".iris"));
    expect(iris.map((p) => p.color)).toEqual(["#12ab34", "#12ab34"]);
    expect(spec.groups.eyeL.origin[0]).toBeCloseTo(-spec.groups.eyeR.origin[0]);
    // The avatar's left eye sits on screen right.
    expect(spec.groups.eyeL.origin[0]).toBeGreaterThan(0);
  });

  it("adds accessories only when chosen", () => {
    const none = buildCreatorSpec(base).parts.filter((p) =>
      p.id.startsWith("acc."),
    );
    const ears = buildCreatorSpec({ ...base, accessories: ["catEars"] }).parts;
    expect(none).toHaveLength(0);
    expect(ears.some((p) => p.id === "acc.earL")).toBe(true);
    expect(ears.some((p) => p.id.startsWith("acc.lens"))).toBe(false);
  });

  it("darkens colors without overflowing", () => {
    expect(shade("#808080", 0.5)).toBe("#404040");
    expect(shade("#ffffff", 2)).toBe("#ffffff");
  });

  it("dresses the legs according to the bottom style", () => {
    const legColor = (style: "pants" | "shorts" | "skirt") =>
      buildCreatorSpec({ ...base, bottom: { style, color: "#123456" } }).parts;
    expect(legColor("pants").find((p) => p.id === "lower.legL")?.color).toBe(
      "#123456",
    );
    expect(legColor("skirt").find((p) => p.id === "lower.legL")?.color).toBe(
      base.skin,
    );
    expect(legColor("skirt").some((p) => p.id === "lower.skirt")).toBe(true);
    expect(legColor("shorts").some((p) => p.id === "lower.shortL")).toBe(true);
  });

  it("widens the body without touching the head", () => {
    const narrow = buildCreatorSpec({ ...base, bodyWidth: 0.8 }).parts;
    const wide = buildCreatorSpec({ ...base, bodyWidth: 1.2 }).parts;
    const x = (parts: typeof wide, id: string) =>
      parts.find((p) => p.id === id)?.position[0] ?? 0;
    expect(x(wide, "body.handL")).toBeGreaterThan(x(narrow, "body.handL"));
    expect(x(wide, "eyeL.white")).toBe(x(narrow, "eyeL.white"));
  });
});
