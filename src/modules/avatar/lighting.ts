import type { Scene } from "@/modules/profiles/schema";

type Light = {
  color: number;
  intensity: number;
  position: [number, number, number];
};
export type LightRig = {
  key: Light;
  fill: Light;
  sky: number;
  ground: number;
  ambient: number;
};

/** Lighting moods for 3D avatars; intensities are multiples of PI like three's physical lights. */
export const LIGHT_RIGS: Record<Scene["lighting"], LightRig> = {
  studio: {
    key: { color: 0xffffff, intensity: 0.55, position: [0.6, 1.2, 1.5] },
    fill: { color: 0xffffff, intensity: 0.1, position: [-1, 0.5, 1] },
    sky: 0xffffff,
    ground: 0x404050,
    ambient: 0.35,
  },
  soft: {
    key: { color: 0xfff6ec, intensity: 0.35, position: [0.3, 1, 1.5] },
    fill: { color: 0xeef2ff, intensity: 0.2, position: [-1, 0.6, 1] },
    sky: 0xffffff,
    ground: 0x808090,
    ambient: 0.75,
  },
  sunset: {
    key: { color: 0xffa860, intensity: 0.6, position: [-1.2, 0.6, 1] },
    fill: { color: 0x7a6cff, intensity: 0.15, position: [1, 0.8, 0.6] },
    sky: 0xffd2a0,
    ground: 0x402840,
    ambient: 0.35,
  },
  neon: {
    key: { color: 0xff4fd8, intensity: 0.5, position: [-1, 0.6, 1] },
    fill: { color: 0x3fd0ff, intensity: 0.5, position: [1, 0.6, 1] },
    sky: 0x6050a0,
    ground: 0x101020,
    ambient: 0.2,
  },
  night: {
    key: { color: 0x9fb4ff, intensity: 0.3, position: [0.8, 1.4, 1] },
    fill: { color: 0x304080, intensity: 0.1, position: [-1, 0.4, 1] },
    sky: 0x303060,
    ground: 0x101018,
    ambient: 0.3,
  },
};

export const LIGHTING_LABEL: Record<Scene["lighting"], string> = {
  studio: "Studio",
  soft: "Doux",
  sunset: "Coucher de soleil",
  neon: "Néon",
  night: "Nuit",
};

/** CSS for the décor layer drawn behind any avatar, or null for a transparent stage. */
export function backgroundCss(
  scene: Scene,
  imageUrl: string | null,
): string | null {
  const b = scene.background;
  switch (b.kind) {
    case "none":
      return null;
    case "color":
      return b.color;
    case "gradient":
      return `linear-gradient(${b.angle}deg, ${b.color}, ${b.color2})`;
    case "image":
      return imageUrl
        ? `center / cover no-repeat url("${encodeURI(imageUrl).replace(/["\\]/g, "")}"), ${b.color}`
        : b.color;
  }
}
