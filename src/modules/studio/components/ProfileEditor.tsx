import { useMutation } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { AppModal } from "@/components/shared/app-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Motion, Profile } from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import { SliderField } from "@/modules/studio/components/fields";
import { PngtuberEditor } from "@/modules/studio/components/PngtuberEditor";
import { PuppetEditor } from "@/modules/studio/components/PuppetEditor";
import { SceneEditor } from "@/modules/studio/components/SceneEditor";
import { VoiceEditor } from "@/modules/studio/components/VoiceEditor";
import { Live2dEditor } from "@/modules/studio/components/Live2dEditor";
import { VrmEditor } from "@/modules/studio/components/VrmEditor";

const signed = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v * 100)}`;

function MotionEditor({ profile }: { profile: Profile }) {
  const update = useProfiles((s) => s.update);
  const m = profile.motion;
  const set = (patch: Partial<Motion>) =>
    update(profile.id, (p) => ({ ...p, motion: { ...p.motion, ...patch } }));
  return (
    <div className="flex flex-col gap-5">
      <SliderField
        label="Taille"
        value={m.scale}
        min={0.2}
        max={3}
        onChange={(scale) => set({ scale })}
      />
      <SliderField
        label="Position horizontale"
        value={m.offsetX}
        min={-1}
        max={1}
        format={signed}
        onChange={(offsetX) => set({ offsetX })}
      />
      <SliderField
        label="Position verticale"
        value={m.offsetY}
        min={-1}
        max={1}
        format={signed}
        onChange={(offsetY) => set({ offsetY })}
      />
      <SliderField
        label="Suivi de la tête"
        value={m.head}
        min={0}
        max={2}
        onChange={(head) => set({ head })}
      />
      {profile.kind !== "puppet" ? (
        <SliderField
          label="Rebond quand tu parles"
          value={m.bounce}
          min={0}
          max={2}
          onChange={(bounce) => set({ bounce })}
        />
      ) : null}
      <SliderField
        label="Respiration"
        value={m.breath}
        min={0}
        max={2}
        onChange={(breath) => set({ breath })}
      />
      <p className="text-xs leading-relaxed text-muted-foreground">
        Dans OBS, la source navigateur peut aussi être recadrée et
        redimensionnée librement.
      </p>
    </div>
  );
}

type Props = {
  profile: Profile;
  dropHover: string | null;
  onDeleted: () => void;
};

export function ProfileEditor({ profile, dropHover, onDeleted }: Props) {
  const update = useProfiles((s) => s.update);
  const remove = useProfiles((s) => s.remove);
  const [confirm, setConfirm] = useState(false);
  const del = useMutation({
    mutationFn: () => remove(profile.id),
    onSuccess: () => {
      setConfirm(false);
      onDeleted();
    },
    onError: (e) =>
      toast.error("Suppression impossible", { description: String(e) }),
  });

  return (
    <aside
      aria-label="Édition du persona"
      className="flex w-[380px] shrink-0 flex-col border-l border-border/70 bg-sidebar"
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <Input
          aria-label="Nom du persona"
          value={profile.name}
          maxLength={60}
          onChange={(e) =>
            e.target.value.trim() &&
            update(profile.id, (p) => ({ ...p, name: e.target.value }))
          }
          className="h-9 font-heading text-base font-medium"
        />
        <Button
          size="icon"
          variant="ghost"
          onClick={() => setConfirm(true)}
          aria-label="Supprimer le persona"
        >
          <Trash2 />
        </Button>
      </div>
      <Tabs defaultValue="images" className="min-h-0 flex-1 gap-0">
        <TabsList className="mx-4 grid grid-cols-4">
          <TabsTrigger value="images">
            {profile.kind === "pngtuber"
              ? "Images"
              : profile.kind === "puppet"
                ? "Visage"
                : "Modèle"}
          </TabsTrigger>
          <TabsTrigger value="motion">Mouvement</TabsTrigger>
          <TabsTrigger value="voice">Voix</TabsTrigger>
          <TabsTrigger value="scene">Décor</TabsTrigger>
        </TabsList>
        <ScrollArea className="min-h-0 flex-1">
          <TabsContent value="images" className="p-4">
            {profile.kind === "pngtuber" ? (
              <PngtuberEditor profile={profile} dropHover={dropHover} />
            ) : profile.kind === "puppet" ? (
              <PuppetEditor profile={profile} dropHover={dropHover} />
            ) : profile.kind === "vrm" ? (
              <VrmEditor profile={profile} dropHover={dropHover} />
            ) : (
              <Live2dEditor profile={profile} dropHover={dropHover} />
            )}
          </TabsContent>
          <TabsContent value="motion" className="p-4">
            <MotionEditor profile={profile} />
          </TabsContent>
          <TabsContent value="voice" className="p-4">
            <VoiceEditor profile={profile} />
          </TabsContent>
          <TabsContent value="scene" className="p-4">
            <SceneEditor profile={profile} dropHover={dropHover} />
          </TabsContent>
        </ScrollArea>
      </Tabs>

      <AppModal
        open={confirm}
        onOpenChange={setConfirm}
        title={`Supprimer « ${profile.name} » ?`}
        description="Le persona et toutes ses images importées seront effacés. Cette action est définitive."
        pending={del.isPending}
        size="sm"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConfirm(false)}
              disabled={del.isPending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={() => del.mutate()}
              disabled={del.isPending}
            >
              {del.isPending ? "Suppression…" : "Supprimer"}
            </Button>
          </>
        }
      />
    </aside>
  );
}
