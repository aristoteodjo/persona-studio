import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import {
  newProfile,
  type Profile,
  type ProfileKind,
  profileSchema,
  referencedMedia,
} from "@/modules/profiles/schema";

const SAVE_DELAY_MS = 350;
const pendingSaves = new Map<string, number>();

function persist(profile: Profile) {
  const prev = pendingSaves.get(profile.id);
  if (prev) window.clearTimeout(prev);
  pendingSaves.set(
    profile.id,
    window.setTimeout(async () => {
      pendingSaves.delete(profile.id);
      try {
        await invoke("profile_save", {
          id: profile.id,
          json: JSON.stringify(profile),
        });
      } catch (e) {
        useProfiles.setState({ saveError: String(e) });
      }
    }, SAVE_DELAY_MS),
  );
}

type ProfilesState = {
  profiles: Profile[];
  loaded: boolean;
  loadError: string | null;
  saveError: string | null;
  load: () => Promise<void>;
  create: (name: string, kind: ProfileKind) => Promise<Profile>;
  update: (id: string, recipe: (p: Profile) => Profile) => void;
  remove: (id: string) => Promise<void>;
  importImage: (id: string, sourcePath: string) => Promise<string>;
  importLive2d: (id: string, model3Path: string) => Promise<string>;
};

export const useProfiles = create<ProfilesState>((set, get) => ({
  profiles: [],
  loaded: false,
  loadError: null,
  saveError: null,
  load: async () => {
    try {
      const raw = await invoke<unknown[]>("profiles_list");
      const profiles = raw
        .map((r) => profileSchema.safeParse(r))
        .filter((r) => r.success)
        .map((r) => r.data)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      set({ profiles, loaded: true, loadError: null });
      // Pruning only at startup: an image imported a moment ago may not be referenced yet.
      for (const p of profiles) {
        invoke("profile_prune_media", {
          id: p.id,
          keep: referencedMedia(p),
        }).catch((e) => console.warn("media prune failed", e));
      }
    } catch (e) {
      set({ loaded: true, loadError: String(e) });
    }
  },
  create: async (name, kind) => {
    const profile = newProfile(name.trim(), kind);
    await invoke("profile_save", {
      id: profile.id,
      json: JSON.stringify(profile),
    });
    set({ profiles: [...get().profiles, profile] });
    return profile;
  },
  update: (id, recipe) => {
    let saved: Profile | null = null;
    const profiles = get().profiles.map((p) => {
      if (p.id !== id) return p;
      const next = { ...recipe(p), updatedAt: new Date().toISOString() };
      const checked = profileSchema.safeParse(next);
      if (!checked.success) {
        console.error("rejected invalid profile update", checked.error);
        return p;
      }
      saved = checked.data;
      return checked.data;
    });
    set({ profiles, saveError: null });
    if (saved) persist(saved);
  },
  remove: async (id) => {
    const timer = pendingSaves.get(id);
    if (timer) window.clearTimeout(timer);
    pendingSaves.delete(id);
    await invoke("profile_delete", { id });
    set({ profiles: get().profiles.filter((p) => p.id !== id) });
  },
  importImage: (id, sourcePath) =>
    invoke<string>("profile_import_image", { id, source: sourcePath }),
  importLive2d: (id, model3Path) =>
    invoke<string>("profile_import_live2d", { id, source: model3Path }),
}));
