import { z } from "zod";

const unit = (min: number, max: number, fallback: number) =>
  z.number().min(min).max(max).catch(fallback).default(fallback);

export const motionSchema = z.object({
  scale: unit(0.2, 3, 1),
  offsetX: unit(-1, 1, 0),
  offsetY: unit(-1, 1, 0),
  head: unit(0, 2, 1),
  bounce: unit(0, 2, 1),
  breath: unit(0, 2, 1),
});

/** Media names are produced by the import (`<uuid>.<ext>`); anything else is rejected,
 * since profiles also arrive from the overlay socket and end up in URLs and CSS. */
export const MEDIA_NAME =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp|gif|vrm|zip)$/;
const mediaName = z.string().regex(MEDIA_NAME).nullable().default(null);

export const expressionSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(40),
  hotkey: z.number().int().min(1).max(9).nullable().default(null),
  idle: mediaName,
  talk: mediaName,
  blink: mediaName,
  talkBlink: mediaName,
});

export const puppetSchema = z.object({
  image: mediaName,
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  /** 468 face landmarks detected on the image, flattened [x, y, z] in image-normalized space. */
  landmarks: z.array(z.number()).default([]),
  mouthColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .catch("#3a1418")
    .default("#3a1418"),
  mouth: unit(0, 2, 1),
  eyes: unit(0, 2, 1),
  brows: unit(0, 2, 1),
});

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const VRM_REST_EXPRESSIONS = [
  "neutral",
  "happy",
  "relaxed",
  "angry",
  "sad",
  "surprised",
] as const;

export const PATTERNS = [
  "stripes",
  "dots",
  "checks",
  "stars",
  "hearts",
  "zigzag",
] as const;

export const patternSchema = z.object({
  type: z.enum(PATTERNS),
  color: hexColor.catch("#ffffff").default("#ffffff"),
  scale: unit(0.2, 4, 1),
  angle: z.number().min(-90).max(90).catch(0).default(0),
  opacity: unit(0, 1, 0.8),
});

/** In-app tweaks layered over the model, keyed by material name so they survive re-exports. */
export const vrmCustomSchema = z.object({
  materials: z
    .record(
      z.string().max(200),
      z.object({
        /** Target color: the texture is recolored toward it, shading kept. */
        color: hexColor.nullable().catch(null).default(null),
        hidden: z.boolean().catch(false).default(false),
        pattern: patternSchema.nullable().catch(null).default(null),
      }),
    )
    .catch({})
    .default({}),
  headScale: unit(0.8, 1.3, 1),
  restExpression: z
    .enum(VRM_REST_EXPRESSIONS)
    .catch("neutral")
    .default("neutral"),
  restWeight: unit(0, 1, 0.5),
});

export const vrmSchema = z.object({
  model: mediaName,
  mouth: unit(0, 2, 1),
  eyes: unit(0, 2, 1),
  emotion: unit(0, 2, 1),
  /** How far the arms drop from the T-pose, in radians. */
  arms: unit(0, 1.5, 1.2),
  /** Arms and fingers follow the camera when the hands are visible. */
  gestures: z.boolean().catch(true).default(true),
  /** Absolute path of a VRoid Studio export kept in sync with this persona. */
  source: z.string().max(1024).nullable().catch(null).default(null),
  custom: vrmCustomSchema.default(vrmCustomSchema.parse({})),
});

/** A Live2D (Cubism 3+) model, packed by the import into one zip with its settings. */
export const live2dSchema = z.object({
  model: mediaName,
  mouth: unit(0, 2, 1),
  eyes: unit(0, 2, 1),
  /** Body sway following the head. */
  body: unit(0, 2, 1),
  /** Plays the model's own idle motions (hair, breathing) under the tracking. */
  idleMotion: z.boolean().catch(true).default(true),
});

export const CREATOR_HAIR = [
  "short",
  "bob",
  "long",
  "twintails",
  "ponytail",
  "spiky",
] as const;
export const CREATOR_EYES = ["round", "sharp", "sleepy"] as const;
export const CREATOR_OUTFITS = ["hoodie", "tee", "sailor", "jacket"] as const;
export const CREATOR_ACCESSORIES = [
  "catEars",
  "glasses",
  "headphones",
  "horns",
] as const;

/** An avatar built in the app from generated parts: no external asset. */
export const creatorSchema = z.object({
  skin: hexColor.catch("#f2c9a8").default("#f2c9a8"),
  hair: z
    .object({
      style: z.enum(CREATOR_HAIR).catch("bob").default("bob"),
      color: hexColor.catch("#3b2a4a").default("#3b2a4a"),
    })
    .default({ style: "bob", color: "#3b2a4a" }),
  eyes: z
    .object({
      style: z.enum(CREATOR_EYES).catch("round").default("round"),
      color: hexColor.catch("#3f7fd9").default("#3f7fd9"),
      size: unit(0.7, 1.4, 1),
    })
    .default({ style: "round", color: "#3f7fd9", size: 1 }),
  blush: z.boolean().catch(true).default(true),
  outfit: z
    .object({
      style: z.enum(CREATOR_OUTFITS).catch("hoodie").default("hoodie"),
      color: hexColor.catch("#e86a33").default("#e86a33"),
      accent: hexColor.catch("#f4efe6").default("#f4efe6"),
    })
    .default({ style: "hoodie", color: "#e86a33", accent: "#f4efe6" }),
  accessories: z
    .array(z.enum(CREATOR_ACCESSORIES))
    .max(CREATOR_ACCESSORIES.length)
    .catch([])
    .default([]),
  accessoryColor: hexColor.catch("#2b2b33").default("#2b2b33"),
  headScale: unit(0.85, 1.25, 1),
  mouth: unit(0, 2, 1),
  eyesAmount: unit(0, 2, 1),
});

export const voiceChangerSchema = z.object({
  enabled: z.boolean().catch(false).default(false),
  preset: z.string().max(40).catch("natural").default("natural"),
  /** Semitones. */
  pitch: z.number().min(-12).max(12).catch(0).default(0),
  robot: unit(0, 1, 0),
  echo: unit(0, 1, 0),
  reverb: unit(0, 1, 0),
  radio: unit(0, 1, 0),
  volume: unit(0, 2, 1),
});

export const voiceSchema = z.object({
  /** Null follows the global microphone threshold. */
  threshold: z
    .number()
    .min(0.02)
    .max(0.95)
    .nullable()
    .catch(null)
    .default(null),
  mouthGain: unit(0.3, 2, 1),
  shoutLevel: unit(0.5, 1, 0.85),
  shoutExpressionId: z.string().nullable().catch(null).default(null),
  changer: voiceChangerSchema.default(voiceChangerSchema.parse({})),
});

export const LIGHTINGS = ["studio", "soft", "sunset", "neon", "night"] as const;

export const sceneSchema = z.object({
  background: z
    .object({
      kind: z
        .enum(["none", "color", "gradient", "image"])
        .catch("none")
        .default("none"),
      color: hexColor.catch("#1b1b2f").default("#1b1b2f"),
      color2: hexColor.catch("#e86a33").default("#e86a33"),
      angle: z.number().min(0).max(360).catch(160).default(160),
      image: z.string().regex(MEDIA_NAME).nullable().catch(null).default(null),
    })
    .default({
      kind: "none",
      color: "#1b1b2f",
      color2: "#e86a33",
      angle: 160,
      image: null,
    }),
  lighting: z.enum(LIGHTINGS).catch("studio").default("studio"),
  light: unit(0.3, 2, 1),
});

const base = {
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  createdAt: z.string(),
  updatedAt: z.string(),
  motion: motionSchema.default(motionSchema.parse({})),
  voice: voiceSchema.default(voiceSchema.parse({})),
  scene: sceneSchema.default(sceneSchema.parse({})),
};

export const profileSchema = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("pngtuber"),
    expressions: z.array(expressionSchema).min(1),
  }),
  z.object({
    ...base,
    kind: z.literal("puppet"),
    puppet: puppetSchema,
  }),
  z.object({
    ...base,
    kind: z.literal("vrm"),
    vrm: vrmSchema,
  }),
  z.object({
    ...base,
    kind: z.literal("live2d"),
    live2d: live2dSchema,
  }),
  z.object({
    ...base,
    kind: z.literal("creator"),
    creator: creatorSchema,
  }),
]);

export type Motion = z.infer<typeof motionSchema>;
export type Expression = z.infer<typeof expressionSchema>;
export type PuppetConfig = z.infer<typeof puppetSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type PngtuberProfile = Extract<Profile, { kind: "pngtuber" }>;
export type PuppetProfile = Extract<Profile, { kind: "puppet" }>;
export type VrmConfig = z.infer<typeof vrmSchema>;
export type VrmCustom = z.infer<typeof vrmCustomSchema>;
export type Pattern = z.infer<typeof patternSchema>;
export type PatternType = Pattern["type"];
export type Scene = z.infer<typeof sceneSchema>;
export type VrmProfile = Extract<Profile, { kind: "vrm" }>;
export type Live2dConfig = z.infer<typeof live2dSchema>;
export type Live2dProfile = Extract<Profile, { kind: "live2d" }>;
export type CreatorConfig = z.infer<typeof creatorSchema>;
export type CreatorProfile = Extract<Profile, { kind: "creator" }>;
export type ProfileKind = Profile["kind"];
export type VoiceConfig = z.infer<typeof voiceSchema>;
export type VoiceChanger = z.infer<typeof voiceChangerSchema>;
export type ExpressionSlot = "idle" | "talk" | "blink" | "talkBlink";

export const EXPRESSION_SLOTS: ExpressionSlot[] = [
  "idle",
  "talk",
  "blink",
  "talkBlink",
];

export const FACE_LANDMARK_COUNT = 468;

export function newExpression(name: string, hotkey: number | null): Expression {
  return expressionSchema.parse({ id: crypto.randomUUID(), name, hotkey });
}

export function newProfile(name: string, kind: ProfileKind): Profile {
  const now = new Date().toISOString();
  const common = {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    motion: motionSchema.parse({}),
    voice: voiceSchema.parse({}),
    scene: sceneSchema.parse({}),
  };
  switch (kind) {
    case "pngtuber":
      return { ...common, kind, expressions: [newExpression("Neutre", 1)] };
    case "puppet":
      return { ...common, kind, puppet: puppetSchema.parse({}) };
    case "vrm":
      return { ...common, kind, vrm: vrmSchema.parse({}) };
    case "live2d":
      return { ...common, kind, live2d: live2dSchema.parse({}) };
    case "creator":
      return { ...common, kind, creator: creatorSchema.parse({}) };
  }
}

/** Every media file a profile references; anything else in its folder can be pruned. */
export function referencedMedia(profile: Profile): string[] {
  const files =
    profile.kind === "pngtuber"
      ? profile.expressions.flatMap((e) => EXPRESSION_SLOTS.map((s) => e[s]))
      : profile.kind === "puppet"
        ? [profile.puppet.image]
        : profile.kind === "vrm"
          ? [profile.vrm.model]
          : profile.kind === "live2d"
            ? [profile.live2d.model]
            : [];
  files.push(profile.scene.background.image);
  return [...new Set(files.filter((f): f is string => f !== null))];
}

export function coverImage(profile: Profile): string | null {
  if (profile.kind === "puppet") return profile.puppet.image;
  if (
    profile.kind === "vrm" ||
    profile.kind === "live2d" ||
    profile.kind === "creator"
  )
    return null;
  for (const e of profile.expressions) if (e.idle) return e.idle;
  return null;
}

export function isPuppetReady(p: PuppetConfig): boolean {
  return (
    p.image !== null &&
    p.width !== null &&
    p.height !== null &&
    p.landmarks.length === FACE_LANDMARK_COUNT * 3
  );
}
