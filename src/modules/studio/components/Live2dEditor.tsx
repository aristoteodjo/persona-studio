import { useMutation } from "@tanstack/react-query";
import { Loader2, Sparkles, Upload } from "lucide-react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Live2dConfig, Live2dProfile } from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import { SliderField } from "@/modules/studio/components/fields";
import {
  DROP_ATTR,
  pickLive2d,
  useDropTarget,
} from "@/modules/studio/lib/files";

export const LIVE2D_DROP_ID = "live2d:model";
const PACKED = /^[0-9a-f-]{36}\.zip$/;

type Props = { profile: Live2dProfile; dropHover: string | null };

export function Live2dEditor({ profile, dropHover }: Props) {
  const update = useProfiles((s) => s.update);
  const importLive2d = useProfiles((s) => s.importLive2d);
  const { live2d } = profile;
  const patch = (next: Partial<Live2dConfig>) =>
    update(profile.id, (p) =>
      p.kind === "live2d" ? { ...p, live2d: { ...p.live2d, ...next } } : p,
    );

  const importer = useMutation({
    mutationFn: (path: string) => importLive2d(profile.id, path),
    onSuccess: (name) => {
      if (typeof name !== "string" || !PACKED.test(name)) {
        toast.error("Import inattendu", {
          description: "Le modèle importé n'a pas été reconnu.",
        });
        return;
      }
      patch({ model: name });
    },
    onError: (e) =>
      toast.error("Import impossible", { description: String(e) }),
  });

  useDropTarget(LIVE2D_DROP_ID, (path) => {
    if (!importer.isPending) importer.mutate(path);
  });

  const pick = async () => {
    const path = await pickLive2d();
    if (path) importer.mutate(path);
  };

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        {...{ [DROP_ATTR]: LIVE2D_DROP_ID }}
        onClick={pick}
        disabled={importer.isPending}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-left transition outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
          dropHover === LIVE2D_DROP_ID && "border-primary bg-primary/10",
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
          {importer.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="size-5 text-primary" aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">
            {importer.isPending
              ? "Import du modèle…"
              : live2d.model
                ? "Remplacer le modèle"
                : "Importer un modèle Live2D"}
          </span>
          <span className="text-xs text-muted-foreground">
            Choisis le fichier .model3.json du modèle : ses textures, sa
            physique et ses mouvements sont copiés avec lui.
          </span>
        </span>
        <Upload
          className="ml-auto size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      {live2d.model ? (
        <>
          <SliderField
            label="Ouverture de la bouche"
            value={live2d.mouth}
            min={0}
            max={2}
            onChange={(mouth) => patch({ mouth })}
          />
          <SliderField
            label="Clignement des yeux"
            value={live2d.eyes}
            min={0}
            max={2}
            onChange={(eyes) => patch({ eyes })}
          />
          <SliderField
            label="Le corps suit la tête"
            value={live2d.body}
            min={0}
            max={2}
            onChange={(body) => patch({ body })}
          />
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="live2d-idle">Mouvements de repos du modèle</Label>
              <span className="text-xs leading-relaxed text-muted-foreground">
                Joue les animations d'attente fournies avec le modèle, sous ton
                suivi de tête.
              </span>
            </div>
            <Switch
              id="live2d-idle"
              checked={live2d.idleMotion}
              onCheckedChange={(v) => patch({ idleMotion: Boolean(v) })}
            />
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Le cadrage (taille, position) se règle dans l'onglet Mouvement.
            Respecte la licence du modèle.
          </p>
        </>
      ) : null}
    </div>
  );
}
