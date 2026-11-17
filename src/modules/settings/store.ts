import { LazyStore } from "@tauri-apps/plugin-store";
import { z } from "zod";
import { create } from "zustand";

const calibrationSchema = z.object({
  yaw: z.number(),
  pitch: z.number(),
  roll: z.number(),
  x: z.number(),
  y: z.number(),
  pitchRatio: z.number(),
});

export const settingsSchema = z.object({
  cameraEnabled: z.boolean().catch(true).default(true),
  cameraId: z.string().nullable().catch(null).default(null),
  micEnabled: z.boolean().catch(true).default(true),
  micId: z.string().nullable().catch(null).default(null),
  micThreshold: z.number().min(0.02).max(0.95).catch(0.35).default(0.35),
  mouthSource: z.enum(["voice", "face", "both"]).catch("both").default("both"),
  mirror: z.boolean().catch(true).default(true),
  smoothing: z.number().min(0).max(1).catch(0.35).default(0.35),
  globalHotkeys: z.boolean().catch(true).default(true),
  monitorVoice: z.boolean().catch(false).default(false),
  activeProfileId: z.string().nullable().catch(null).default(null),
  calibration: calibrationSchema.nullable().catch(null).default(null),
});

export type Settings = z.infer<typeof settingsSchema>;
export type MouthSource = Settings["mouthSource"];

const disk = new LazyStore("settings.json", { defaults: {}, autoSave: 400 });
const KEY = "settings";

type SettingsState = {
  settings: Settings;
  loaded: boolean;
  load: () => Promise<void>;
  set: (patch: Partial<Settings>) => void;
};

export const useSettings = create<SettingsState>((set, get) => ({
  settings: settingsSchema.parse({}),
  loaded: false,
  load: async () => {
    try {
      const raw = await disk.get<unknown>(KEY);
      const parsed = settingsSchema.safeParse(raw ?? {});
      set({
        settings: parsed.success ? parsed.data : settingsSchema.parse({}),
        loaded: true,
      });
    } catch (e) {
      console.error("settings load failed", e);
      set({ loaded: true });
    }
  },
  set: (patch) => {
    const settings = settingsSchema.parse({ ...get().settings, ...patch });
    set({ settings });
    disk
      .set(KEY, settings)
      .catch((e) => console.error("settings save failed", e));
  },
}));

export const getSettings = () => useSettings.getState().settings;
