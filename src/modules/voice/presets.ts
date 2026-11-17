import type { VoiceChanger } from "@/modules/profiles/schema";

export type VoiceFx = Pick<
  VoiceChanger,
  "pitch" | "robot" | "echo" | "reverb" | "radio" | "volume"
>;

export type VoicePreset = { id: string; label: string; fx: VoiceFx };

const fx = (p: Partial<VoiceFx>): VoiceFx => ({
  pitch: 0,
  robot: 0,
  echo: 0,
  reverb: 0,
  radio: 0,
  volume: 1,
  ...p,
});

export const VOICE_PRESETS: VoicePreset[] = [
  { id: "natural", label: "Naturelle", fx: fx({}) },
  { id: "high", label: "Aiguë", fx: fx({ pitch: 4 }) },
  { id: "low", label: "Grave", fx: fx({ pitch: -4 }) },
  { id: "chipmunk", label: "Écureuil", fx: fx({ pitch: 9 }) },
  { id: "monster", label: "Monstre", fx: fx({ pitch: -8, reverb: 0.25 }) },
  { id: "robot", label: "Robot", fx: fx({ pitch: -1, robot: 0.85 }) },
  { id: "radio", label: "Radio", fx: fx({ radio: 1 }) },
  { id: "cave", label: "Caverne", fx: fx({ echo: 0.45, reverb: 0.4 }) },
  {
    id: "ghost",
    label: "Fantôme",
    fx: fx({ pitch: 2, echo: 0.35, reverb: 0.6 }),
  },
];

export const CUSTOM_PRESET = "custom";

export function presetFx(id: string): VoiceFx | null {
  return VOICE_PRESETS.find((p) => p.id === id)?.fx ?? null;
}

/** Applies a preset, or marks the changer as custom when any slider is moved by hand. */
export function withPreset(changer: VoiceChanger, id: string): VoiceChanger {
  const p = presetFx(id);
  return p ? { ...changer, ...p, preset: id } : changer;
}

export function withFx(
  changer: VoiceChanger,
  patch: Partial<VoiceFx>,
): VoiceChanger {
  return { ...changer, ...patch, preset: CUSTOM_PRESET };
}

export const semitonesToRatio = (st: number) => 2 ** (st / 12);

export type ShoutState = { shouting: boolean; lastLoud: number };

/** Loud bursts switch the avatar to its shout reaction, held briefly so it does not flicker. */
export function updateShout(
  s: ShoutState,
  level: number,
  now: number,
  shoutLevel: number,
  holdMs = 500,
): ShoutState {
  if (level >= shoutLevel) return { shouting: true, lastLoud: now };
  if (s.shouting && now - s.lastLoud < holdMs) return s;
  return { shouting: false, lastLoud: s.lastLoud };
}
