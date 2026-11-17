import { describe, expect, it } from "vitest";
import {
  materialKey,
  partGroup,
  partLabel,
} from "@/modules/avatar/vrm/materials";

describe("vrm materials", () => {
  it("merges outline and instance variants", () => {
    expect(materialKey("N00_000_Hair_00_HAIR (Instance) (Outline)")).toBe(
      "N00_000_Hair_00_HAIR",
    );
    expect(materialKey("Body (Outline)")).toBe("Body");
  });

  it("groups VRoid parts", () => {
    expect(partGroup("N00_000_00_HairBack_00_HAIR")).toBe("hair");
    expect(partGroup("N00_000_00_EyeIris_00_EYE")).toBe("eyes");
    expect(partGroup("N00_000_00_FaceMouth_00_FACE")).toBe("face");
    expect(partGroup("N00_000_00_Body_00_SKIN")).toBe("skin");
    expect(partGroup("N00_001_01_Tops_01_CLOTH")).toBe("clothes");
    expect(partGroup("Material.012")).toBe("other");
  });

  it("produces short labels", () => {
    expect(partLabel("N00_000_00_HairBack_00_HAIR")).toBe("HairBack");
    expect(partLabel("N00_001_01_Tops_01_CLOTH")).toBe("Tops");
    expect(partLabel("Material.012")).toBe("Material.012");
  });
});
