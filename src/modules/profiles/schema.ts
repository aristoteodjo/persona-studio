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

const mediaName = z.string().min(1).nullable().default(null);

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

export const vrmSchema = z.object({
  model: mediaName,
  mouth: unit(0, 2, 1),
  eyes: unit(0, 2, 1),
  emotion: unit(0, 2, 1),
  /** How far the arms drop from the T-pose, in radians. */
  arms: unit(0, 1.5, 1.2),
});

const base = {
  id: z.string().uuid(),
  name: z.string().min(1).max(60),
  createdAt: z.string(),
  updatedAt: z.string(),
  motion: motionSchema.default(motionSchema.parse({})),
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
]);

export type Motion = z.infer<typeof motionSchema>;
export type Expression = z.infer<typeof expressionSchema>;
export type PuppetConfig = z.infer<typeof puppetSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type PngtuberProfile = Extract<Profile, { kind: "pngtuber" }>;
export type PuppetProfile = Extract<Profile, { kind: "puppet" }>;
export type VrmConfig = z.infer<typeof vrmSchema>;
export type VrmProfile = Extract<Profile, { kind: "vrm" }>;
export type ProfileKind = Profile["kind"];
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
  };
  switch (kind) {
    case "pngtuber":
      return { ...common, kind, expressions: [newExpression("Neutre", 1)] };
    case "puppet":
      return { ...common, kind, puppet: puppetSchema.parse({}) };
    case "vrm":
      return { ...common, kind, vrm: vrmSchema.parse({}) };
  }
}

/** Every media file a profile references; anything else in its folder can be pruned. */
export function referencedMedia(profile: Profile): string[] {
  const files =
    profile.kind === "pngtuber"
      ? profile.expressions.flatMap((e) => EXPRESSION_SLOTS.map((s) => e[s]))
      : profile.kind === "puppet"
        ? [profile.puppet.image]
        : [profile.vrm.model];
  return [...new Set(files.filter((f): f is string => f !== null))];
}

export function coverImage(profile: Profile): string | null {
  if (profile.kind === "puppet") return profile.puppet.image;
  if (profile.kind === "vrm") return null;
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
