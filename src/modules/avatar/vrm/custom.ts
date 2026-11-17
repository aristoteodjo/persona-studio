import type { VRM } from "@pixiv/three-vrm";
import { Color, type Material, type Mesh } from "three";
import { create } from "zustand";
import {
  materialKey,
  type PartGroup,
  partGroup,
  partLabel,
} from "@/modules/avatar/vrm/materials";
import {
  VRM_REST_EXPRESSIONS,
  type VrmCustom,
} from "@/modules/profiles/schema";

type Tintable = Material & { color?: Color; shadeColorFactor?: Color };
type Original = {
  material: Tintable;
  color: Color | null;
  shade: Color | null;
  visible: boolean;
};

export type ModelPart = {
  key: string;
  label: string;
  group: PartGroup;
  color: string;
};

/** What the loaded model offers to the editor (parts, expressions). Studio only reads it. */
export const useVrmModelInfo = create<{
  profileId: string | null;
  parts: ModelPart[];
  expressions: string[];
}>(() => ({ profileId: null, parts: [], expressions: [] }));

export function collectMaterials(vrm: VRM): Map<string, Original[]> {
  const map = new Map<string, Original[]>();
  vrm.scene.traverse((o) => {
    const mesh = o as Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of list as Tintable[]) {
      const key = materialKey(m.name || "Material");
      const entry = map.get(key) ?? [];
      if (entry.some((e) => e.material === m)) continue;
      entry.push({
        material: m,
        color: m.color?.clone() ?? null,
        shade: m.shadeColorFactor?.clone() ?? null,
        visible: m.visible,
      });
      map.set(key, entry);
    }
  });
  return map;
}

export function describeModel(vrm: VRM, map: Map<string, Original[]>) {
  const parts: ModelPart[] = [...map.entries()].map(([key, list]) => {
    const base = list.find((o) => o.color)?.color;
    return {
      key,
      label: partLabel(key),
      group: partGroup(key),
      color: base ? `#${base.getHexString()}` : "#ffffff",
    };
  });
  const expressions =
    vrm.expressionManager?.expressions.map((e) => e.expressionName) ?? [];
  return { parts, expressions };
}

const tint = new Color();

/** Re-applies every override from the originals, so removing one restores the model. */
export function applyCustom(
  vrm: VRM,
  map: Map<string, Original[]>,
  custom: VrmCustom,
) {
  for (const [key, list] of map) {
    const cfg = custom.materials[key];
    for (const o of list) {
      o.material.visible = o.visible && !cfg?.hidden;
      if (o.material.color && o.color) {
        if (cfg?.color) o.material.color.set(cfg.color);
        else o.material.color.copy(o.color);
      }
      if (o.material.shadeColorFactor && o.shade) {
        o.material.shadeColorFactor.copy(o.shade);
        if (cfg?.color)
          o.material.shadeColorFactor.multiply(tint.set(cfg.color));
      }
    }
  }
  vrm.humanoid.getRawBoneNode("head")?.scale.setScalar(custom.headScale);
}

/** Weight of the persona's resting mood, merged under the live expressions. */
export function restExpressions(custom: VrmCustom): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of VRM_REST_EXPRESSIONS) {
    if (name === "neutral") continue;
    out[name] = name === custom.restExpression ? custom.restWeight : 0;
  }
  return out;
}
