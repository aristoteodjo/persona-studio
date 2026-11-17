import type { CreatorConfig } from "@/modules/profiles/schema";

export type Vec3 = [number, number, number];

/**
 * sphere [r] · capsule [r, length] · box [w, h, d] · cylinder [rTop, rBottom, h]
 * · cone [r, h] · torus [radius, tube, arc]
 */
export type Shape =
  | "sphere"
  | "capsule"
  | "box"
  | "cylinder"
  | "cone"
  | "torus";

export type GroupId =
  | "body"
  | "head"
  | "eyeL"
  | "eyeR"
  | "browL"
  | "browR"
  | "mouth";

export type Part = {
  id: string;
  group: GroupId;
  shape: Shape;
  dims: number[];
  position: Vec3;
  rotation?: Vec3;
  scale?: Vec3;
  color: string;
  /** Unlit: eye highlights and pupils stay crisp under any lighting. */
  flat?: boolean;
};

export type Group = { parent: GroupId | null; origin: Vec3 };

export type CreatorSpec = {
  groups: Record<GroupId, Group>;
  parts: Part[];
  /** World position the camera frames, between the eyes. */
  focus: Vec3;
};

/** Neck pivot in world space; everything on the head is placed relative to it. */
const NECK: Vec3 = [0, 1.32, 0];
const HEAD_R = 0.13;
const EYE_X = 0.048;
const EYE_Y = 0.1;
const FACE_Z = 0.118;
const MOUTH_INSIDE = "#7a2433";
const DARK = "#1d1626";
const WHITE = "#ffffff";

export function shade(hex: string, k: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const ch = (v: number) =>
    Math.round(Math.min(Math.max(v * k, 0), 255))
      .toString(16)
      .padStart(2, "0");
  return `#${ch((n >> 16) & 255)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}

function eyeParts(side: "L" | "R", cfg: CreatorConfig): Part[] {
  const group = side === "L" ? "eyeL" : "eyeR";
  // The avatar's left eye is on screen right (+X); outer corners tilt away from the nose.
  const out = side === "L" ? 1 : -1;
  const s = cfg.eyes.size;
  const style = cfg.eyes.style;
  const white: Vec3 =
    style === "sharp"
      ? [1.25, 0.82, 0.35]
      : style === "sleepy"
        ? [1.1, 0.72, 0.35]
        : [1, 1.15, 0.35];
  const tilt =
    style === "sharp" ? 0.18 * out : style === "sleepy" ? -0.08 * out : 0;
  const lidY = 0.028 * s * white[1];
  return [
    {
      id: `eye${side}.white`,
      group,
      shape: "sphere",
      dims: [0.028 * s],
      position: [0, 0, 0],
      rotation: [0, 0, tilt],
      scale: white,
      color: WHITE,
      flat: true,
    },
    {
      id: `eye${side}.iris`,
      group,
      shape: "sphere",
      dims: [0.019 * s],
      position: [0, -0.002, 0.006],
      scale: [1, style === "round" ? 1.2 : 1, 0.3],
      color: cfg.eyes.color,
    },
    {
      id: `eye${side}.pupil`,
      group,
      shape: "sphere",
      dims: [0.009 * s],
      position: [0, -0.002, 0.011],
      scale: [1, 1.2, 0.3],
      color: DARK,
      flat: true,
    },
    {
      id: `eye${side}.shine`,
      group,
      shape: "sphere",
      dims: [0.0055 * s],
      position: [0.006 * s, 0.007 * s, 0.014],
      scale: [1, 1, 0.3],
      color: WHITE,
      flat: true,
    },
    {
      id: `eye${side}.lash`,
      group,
      shape: "box",
      dims: [0.062 * s * white[0], 0.0065, 0.012],
      position: [0, lidY, 0.004],
      rotation: [0, 0, tilt],
      color: DARK,
      flat: true,
    },
  ];
}

function hairParts(cfg: CreatorConfig): Part[] {
  const c = cfg.hair.color;
  const dark = shade(c, 0.82);
  const parts: Part[] = [
    {
      id: "hair.cap",
      group: "head",
      shape: "sphere",
      dims: [HEAD_R + 0.006],
      position: [0, 0.165, -0.035],
      scale: [1.04, 0.95, 1],
      color: c,
    },
  ];
  const bangs = (count: number, len: number) => {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1) - 0.5;
      parts.push({
        id: `hair.bang${i}`,
        group: "head",
        shape: "capsule",
        dims: [0.026, len],
        position: [
          t * 0.19,
          0.205 - Math.abs(t) * 0.03,
          0.095 - Math.abs(t) * 0.04,
        ],
        rotation: [-0.35, 0, t * 0.6],
        color: i % 2 ? dark : c,
      });
    }
  };
  const sides = (bottom: number) => {
    for (const x of [-1, 1]) {
      parts.push({
        id: `hair.side${x > 0 ? "L" : "R"}`,
        group: "head",
        shape: "capsule",
        dims: [0.035, 0.14 - bottom],
        position: [x * 0.125, 0.09 + bottom / 2, 0.02],
        rotation: [0, 0, x * 0.06],
        color: c,
      });
    }
  };
  switch (cfg.hair.style) {
    case "short":
      bangs(5, 0.035);
      break;
    case "bob":
      bangs(6, 0.05);
      sides(0);
      parts.push({
        id: "hair.back",
        group: "head",
        shape: "sphere",
        dims: [HEAD_R + 0.02],
        position: [0, 0.09, -0.07],
        scale: [1.05, 0.85, 0.8],
        color: dark,
      });
      break;
    case "long":
      bangs(6, 0.05);
      sides(-0.12);
      parts.push({
        id: "hair.back",
        group: "head",
        shape: "capsule",
        dims: [0.12, 0.3],
        position: [0, -0.05, -0.07],
        scale: [1.15, 1, 0.55],
        color: dark,
      });
      break;
    case "twintails":
      bangs(6, 0.045);
      for (const x of [-1, 1]) {
        parts.push(
          {
            id: `hair.tie${x > 0 ? "L" : "R"}`,
            group: "head",
            shape: "sphere",
            dims: [0.022],
            position: [x * 0.13, 0.17, -0.03],
            color: cfg.outfit.accent,
          },
          {
            id: `hair.tail${x > 0 ? "L" : "R"}`,
            group: "head",
            shape: "capsule",
            dims: [0.045, 0.26],
            position: [x * 0.19, 0.02, -0.04],
            rotation: [0, 0, x * 0.25],
            color: c,
          },
        );
      }
      break;
    case "ponytail":
      bangs(5, 0.045);
      parts.push(
        {
          id: "hair.tie",
          group: "head",
          shape: "sphere",
          dims: [0.024],
          position: [0, 0.2, -0.13],
          color: cfg.outfit.accent,
        },
        {
          id: "hair.tail",
          group: "head",
          shape: "capsule",
          dims: [0.05, 0.25],
          position: [0, 0.06, -0.19],
          rotation: [0.35, 0, 0],
          color: c,
        },
      );
      break;
    case "spiky":
      for (let i = 0; i < 9; i++) {
        const a = (i / 8 - 0.5) * 2.4;
        parts.push({
          id: `hair.spike${i}`,
          group: "head",
          shape: "cone",
          dims: [0.04, 0.11],
          position: [Math.sin(a) * 0.12, 0.2 + Math.cos(a) * 0.06, -0.02],
          rotation: [-0.3, 0, -a * 0.9],
          color: i % 2 ? dark : c,
        });
      }
      bangs(4, 0.04);
      break;
  }
  return parts;
}

function outfitParts(cfg: CreatorConfig): Part[] {
  const { color, accent, style } = cfg.outfit;
  const dark = shade(color, 0.8);
  const parts: Part[] = [
    {
      id: "body.torso",
      group: "body",
      shape: "capsule",
      dims: [0.14, 0.2],
      position: [0, 1.05, 0],
      scale: [1.15, 1, 0.72],
      color,
    },
    {
      id: "body.neck",
      group: "body",
      shape: "cylinder",
      dims: [0.042, 0.048, 0.11],
      position: [0, 1.27, 0],
      color: cfg.skin,
    },
  ];
  for (const x of [-1, 1]) {
    const side = x > 0 ? "L" : "R";
    parts.push(
      {
        id: `body.arm${side}`,
        group: "body",
        shape: "capsule",
        dims: [0.048, 0.3],
        position: [x * 0.205, 1.0, -0.005],
        rotation: [0, 0, x * 0.16],
        color: style === "tee" ? cfg.skin : color,
      },
      {
        id: `body.sleeve${side}`,
        group: "body",
        shape: "capsule",
        dims: [0.058, 0.08],
        position: [x * 0.19, 1.13, -0.005],
        rotation: [0, 0, x * 0.3],
        color,
      },
      {
        id: `body.hand${side}`,
        group: "body",
        shape: "sphere",
        dims: [0.045],
        position: [x * 0.235, 0.81, 0.01],
        color: cfg.skin,
      },
    );
  }
  switch (style) {
    case "hoodie":
      parts.push(
        {
          id: "outfit.hood",
          group: "body",
          shape: "torus",
          dims: [0.1, 0.035, Math.PI * 2],
          position: [0, 1.23, -0.05],
          rotation: [Math.PI / 2 - 0.3, 0, 0],
          color: dark,
        },
        {
          id: "outfit.pocket",
          group: "body",
          shape: "box",
          dims: [0.16, 0.06, 0.02],
          position: [0, 0.93, 0.1],
          color: dark,
        },
      );
      for (const x of [-1, 1]) {
        parts.push({
          id: `outfit.string${x > 0 ? "L" : "R"}`,
          group: "body",
          shape: "cylinder",
          dims: [0.005, 0.005, 0.09],
          position: [x * 0.03, 1.15, 0.105],
          color: accent,
        });
      }
      break;
    case "tee":
      parts.push({
        id: "outfit.collar",
        group: "body",
        shape: "torus",
        dims: [0.055, 0.012, Math.PI * 2],
        position: [0, 1.225, 0.01],
        rotation: [Math.PI / 2 - 0.2, 0, 0],
        color: accent,
      });
      break;
    case "sailor":
      parts.push(
        {
          id: "outfit.collar",
          group: "body",
          shape: "box",
          dims: [0.3, 0.09, 0.2],
          position: [0, 1.2, -0.02],
          rotation: [0.25, 0, 0],
          color: accent,
        },
        {
          id: "outfit.bowL",
          group: "body",
          shape: "cone",
          dims: [0.03, 0.06],
          position: [0.03, 1.16, 0.11],
          rotation: [0, 0, Math.PI / 2],
          color: "#d6334a",
        },
        {
          id: "outfit.bowR",
          group: "body",
          shape: "cone",
          dims: [0.03, 0.06],
          position: [-0.03, 1.16, 0.11],
          rotation: [0, 0, -Math.PI / 2],
          color: "#d6334a",
        },
      );
      break;
    case "jacket":
      parts.push(
        {
          id: "outfit.shirt",
          group: "body",
          shape: "box",
          dims: [0.09, 0.26, 0.02],
          position: [0, 1.06, 0.098],
          color: accent,
        },
        {
          id: "outfit.lapelL",
          group: "body",
          shape: "box",
          dims: [0.035, 0.16, 0.02],
          position: [0.055, 1.13, 0.1],
          rotation: [0, 0, -0.35],
          color: dark,
        },
        {
          id: "outfit.lapelR",
          group: "body",
          shape: "box",
          dims: [0.035, 0.16, 0.02],
          position: [-0.055, 1.13, 0.1],
          rotation: [0, 0, 0.35],
          color: dark,
        },
      );
      break;
  }
  return parts;
}

function lowerParts(cfg: CreatorConfig): Part[] {
  const { style, color } = cfg.bottom;
  const dark = shade(color, 0.85);
  const parts: Part[] = [
    {
      id: "lower.hips",
      group: "body",
      shape: "capsule",
      dims: [0.12, 0.05],
      position: [0, 0.79, 0],
      scale: [1.12, 1, 0.75],
      color,
    },
  ];
  for (const x of [-1, 1]) {
    const side = x > 0 ? "L" : "R";
    parts.push(
      {
        id: `lower.leg${side}`,
        group: "body",
        shape: "capsule",
        dims: [0.052, 0.6],
        position: [x * 0.07, 0.4, 0],
        color: style === "pants" ? color : cfg.skin,
      },
      {
        id: `lower.shoe${side}`,
        group: "body",
        shape: "box",
        dims: [0.08, 0.06, 0.15],
        position: [x * 0.07, 0.03, 0.025],
        color: cfg.shoes,
      },
    );
    if (style === "shorts") {
      parts.push({
        id: `lower.short${side}`,
        group: "body",
        shape: "capsule",
        dims: [0.062, 0.14],
        position: [x * 0.07, 0.66, 0],
        color: dark,
      });
    }
  }
  if (style === "skirt") {
    parts.push({
      id: "lower.skirt",
      group: "body",
      shape: "cylinder",
      dims: [0.14, 0.23, 0.26],
      position: [0, 0.68, 0],
      scale: [1, 1, 0.8],
      color,
    });
  }
  return parts;
}

function accessoryParts(cfg: CreatorConfig): Part[] {
  const c = cfg.accessoryColor;
  const parts: Part[] = [];
  for (const a of new Set(cfg.accessories)) {
    if (a === "catEars") {
      for (const x of [-1, 1]) {
        const side = x > 0 ? "L" : "R";
        parts.push(
          {
            id: `acc.ear${side}`,
            group: "head",
            shape: "cone",
            dims: [0.045, 0.085],
            position: [x * 0.085, 0.255, -0.01],
            rotation: [0, 0, -x * 0.4],
            color: cfg.hair.color,
          },
          {
            id: `acc.earIn${side}`,
            group: "head",
            shape: "cone",
            dims: [0.026, 0.055],
            position: [x * 0.083, 0.25, 0.018],
            rotation: [0, 0, -x * 0.4],
            color: "#f3a3b5",
          },
        );
      }
    } else if (a === "glasses") {
      for (const x of [-1, 1]) {
        parts.push({
          id: `acc.lens${x > 0 ? "L" : "R"}`,
          group: "head",
          shape: "torus",
          dims: [0.034, 0.0045, Math.PI * 2],
          position: [x * EYE_X, EYE_Y, FACE_Z + 0.022],
          color: c,
        });
      }
      parts.push({
        id: "acc.bridge",
        group: "head",
        shape: "box",
        dims: [0.03, 0.005, 0.005],
        position: [0, EYE_Y + 0.008, FACE_Z + 0.022],
        color: c,
      });
    } else if (a === "headphones") {
      parts.push({
        id: "acc.band",
        group: "head",
        shape: "torus",
        dims: [0.152, 0.012, Math.PI],
        position: [0, 0.11, -0.01],
        color: c,
      });
      for (const x of [-1, 1]) {
        parts.push({
          id: `acc.cup${x > 0 ? "L" : "R"}`,
          group: "head",
          shape: "cylinder",
          dims: [0.045, 0.045, 0.035],
          position: [x * 0.148, 0.1, -0.01],
          rotation: [0, 0, Math.PI / 2],
          color: c,
        });
      }
    } else if (a === "horns") {
      for (const x of [-1, 1]) {
        parts.push({
          id: `acc.horn${x > 0 ? "L" : "R"}`,
          group: "head",
          shape: "cone",
          dims: [0.022, 0.08],
          position: [x * 0.07, 0.255, 0.03],
          rotation: [0.2, 0, -x * 0.3],
          color: c,
        });
      }
    }
  }
  return parts;
}

/** Pure description of the avatar; the view turns it into meshes. */
export function buildCreatorSpec(cfg: CreatorConfig): CreatorSpec {
  const skin = cfg.skin;
  const groups: Record<GroupId, Group> = {
    body: { parent: null, origin: [0, 0, 0] },
    head: { parent: null, origin: NECK },
    eyeL: { parent: "head", origin: [EYE_X, EYE_Y, FACE_Z] },
    eyeR: { parent: "head", origin: [-EYE_X, EYE_Y, FACE_Z] },
    browL: {
      parent: "head",
      origin: [EYE_X, EYE_Y + 0.048 * cfg.eyes.size, FACE_Z + 0.004],
    },
    browR: {
      parent: "head",
      origin: [-EYE_X, EYE_Y + 0.048 * cfg.eyes.size, FACE_Z + 0.004],
    },
    mouth: { parent: "head", origin: [0, 0.042, FACE_Z + 0.004] },
  };
  const parts: Part[] = [
    {
      id: "head.skull",
      group: "head",
      shape: "sphere",
      dims: [HEAD_R],
      position: [0, 0.112, 0],
      scale: [1, 1.08, 0.97],
      color: skin,
    },
    {
      id: "head.nose",
      group: "head",
      shape: "sphere",
      dims: [0.007],
      position: [0, 0.07, 0.125],
      color: shade(skin, 0.92),
    },
    {
      id: "head.earL",
      group: "head",
      shape: "sphere",
      dims: [0.022],
      position: [0.127, 0.1, 0],
      scale: [0.5, 1, 0.8],
      color: skin,
    },
    {
      id: "head.earR",
      group: "head",
      shape: "sphere",
      dims: [0.022],
      position: [-0.127, 0.1, 0],
      scale: [0.5, 1, 0.8],
      color: skin,
    },
    {
      id: "mouth.inside",
      group: "mouth",
      shape: "sphere",
      dims: [0.016],
      position: [0, 0, 0],
      scale: [1.3, 1, 0.4],
      color: MOUTH_INSIDE,
      flat: true,
    },
    ...eyeParts("L", cfg),
    ...eyeParts("R", cfg),
  ];
  for (const side of ["L", "R"] as const) {
    const out = side === "L" ? 1 : -1;
    parts.push({
      id: `brow${side}.line`,
      group: side === "L" ? "browL" : "browR",
      shape: "box",
      dims: [0.042, 0.007, 0.01],
      position: [0, 0, 0],
      rotation: [0, 0, -0.1 * out],
      color: shade(cfg.hair.color, 0.75),
      flat: true,
    });
  }
  if (cfg.blush) {
    for (const x of [-1, 1]) {
      parts.push({
        id: `head.blush${x > 0 ? "L" : "R"}`,
        group: "head",
        shape: "sphere",
        dims: [0.018],
        position: [x * 0.072, 0.065, 0.104],
        scale: [1.2, 0.55, 0.3],
        color: "#f0899b",
        flat: true,
      });
    }
  }
  parts.push(
    ...hairParts(cfg),
    ...outfitParts(cfg),
    ...lowerParts(cfg),
    ...accessoryParts(cfg),
  );
  // Body width scales across X only, so shoulders and hips widen without stretching the head.
  for (const p of parts) {
    if (p.group !== "body" || p.id === "body.neck") continue;
    p.position = [p.position[0] * cfg.bodyWidth, p.position[1], p.position[2]];
    const sc = p.scale ?? [1, 1, 1];
    if (
      p.id === "body.torso" ||
      p.id === "lower.hips" ||
      p.id === "lower.skirt"
    ) {
      p.scale = [sc[0] * cfg.bodyWidth, sc[1], sc[2]];
    }
  }
  const s = cfg.headScale;
  return {
    groups,
    parts,
    focus: [0, NECK[1] + EYE_Y * s, 0],
  };
}
