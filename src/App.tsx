import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { pushProfile, useOverlayInfo } from "@/modules/overlay-link";
import { useProfiles } from "@/modules/profiles/store";
import { useSettings } from "@/modules/settings/store";
import { AboutModal } from "@/modules/studio/components/AboutModal";
import { ProfileEditor } from "@/modules/studio/components/ProfileEditor";
import { ProfileList } from "@/modules/studio/components/ProfileList";
import { SettingsModal } from "@/modules/studio/components/SettingsModal";
import { Stage } from "@/modules/studio/components/Stage";
import { AtelierView } from "@/modules/atelier/AtelierView";
import { type Section, TopBar } from "@/modules/studio/components/TopBar";
import { useExpressionHotkeys } from "@/modules/studio/lib/useExpressionHotkeys";
import { useFileDrop } from "@/modules/studio/lib/files";
import { voiceSchema } from "@/modules/profiles/schema";
import { engine, setExpression, useTrackingSync } from "@/modules/tracking";

export function App() {
  const profiles = useProfiles((s) => s.profiles);
  const loaded = useProfiles((s) => s.loaded);
  const loadError = useProfiles((s) => s.loadError);
  const saveError = useProfiles((s) => s.saveError);
  const settingsLoaded = useSettings((s) => s.loaded);
  const activeId = useSettings((s) => s.settings.activeProfileId);
  const globalHotkeys = useSettings((s) => s.settings.globalHotkeys);
  const setSettings = useSettings((s) => s.set);
  const overlay = useOverlayInfo();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [section, setSection] = useState<Section>("studio");
  const [atelierId, setAtelierId] = useState<string | null>(null);
  const dropHover = useFileDrop();

  useEffect(() => {
    void useSettings.getState().load();
    void useProfiles.getState().load();
  }, []);

  useTrackingSync();

  const active = profiles.find((p) => p.id === activeId) ?? profiles[0] ?? null;
  useExpressionHotkeys(active, globalHotkeys);

  const monitorVoice = useSettings((s) => s.settings.monitorVoice);
  const activeVoice = active?.voice ?? null;
  useEffect(() => {
    engine.setVoice(activeVoice ?? voiceSchema.parse({}), monitorVoice);
  }, [activeVoice, monitorVoice]);

  const gestures = active?.kind === "vrm" && active.vrm.gestures;
  useEffect(() => {
    engine.setGestures(gestures);
  }, [gestures]);

  // A persona linked to a VRoid export is re-imported whenever that file changes.
  const watchId = active?.kind === "vrm" ? active.id : null;
  const watchSource = active?.kind === "vrm" ? active.vrm.source : null;
  useEffect(() => {
    invoke("model_watch", {
      id: watchId ?? "",
      source: watchId ? watchSource : null,
    }).catch((e) => console.warn("model watch failed", e));
  }, [watchId, watchSource]);

  useEffect(() => {
    const off = listen<{ id: string; file: string }>("model://updated", (e) => {
      const { id, file } = e.payload;
      if (typeof file !== "string" || !file.endsWith(".vrm")) return;
      useProfiles
        .getState()
        .update(id, (p) =>
          p.kind === "vrm" ? { ...p, vrm: { ...p.vrm, model: file } } : p,
        );
      toast.success("Avatar mis à jour depuis VRoid Studio");
    });
    return () => {
      void off.then((f) => f());
    };
  }, []);

  // The overlay always shows the active profile; re-sent when the server restarts or a client connects.
  useEffect(() => {
    if (!loaded || !overlay.port) return;
    pushProfile(active);
  }, [active, loaded, overlay.port]);

  const select = (id: string) => {
    setSettings({ activeProfileId: id });
    setExpression(null);
  };

  if (!loaded || !settingsLoaded) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Chargement du studio…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <a
        href="#stage"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-24 focus:z-50 focus:rounded focus:bg-primary focus:px-2 focus:py-1 focus:text-primary-foreground"
      >
        Aller à l'aperçu
      </a>
      <TopBar
        section={section}
        onSection={setSection}
        onSettings={() => setSettingsOpen(true)}
        onAbout={() => setAboutOpen(true)}
      />
      {loadError || saveError ? (
        <p
          role="alert"
          className="bg-destructive/15 px-4 py-2 text-xs text-destructive"
        >
          {loadError
            ? `Lecture des personas impossible : ${loadError}`
            : `Enregistrement impossible : ${saveError}`}
        </p>
      ) : null}
      {section === "atelier" ? (
        <AtelierView
          key={atelierId ?? "atelier"}
          profiles={profiles}
          initialId={atelierId}
          onUse={(id) => {
            select(id);
            setSection("studio");
          }}
        />
      ) : null}
      <main
        id="stage"
        className={cn("flex min-h-0 flex-1", section !== "studio" && "hidden")}
      >
        <ProfileList
          profiles={profiles}
          activeId={active?.id ?? null}
          onSelect={select}
        />
        <Stage profile={active} />
        {active ? (
          <ProfileEditor
            key={active.id}
            profile={active}
            dropHover={dropHover}
            onDeleted={() => setSettings({ activeProfileId: null })}
            onOpenAtelier={(id) => {
              setAtelierId(id);
              setSection("atelier");
            }}
          />
        ) : null}
      </main>
      <SettingsModal open={settingsOpen} onOpenChange={setSettingsOpen} />
      <AboutModal open={aboutOpen} onOpenChange={setAboutOpen} />
    </div>
  );
}
