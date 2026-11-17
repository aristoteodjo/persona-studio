import { Box, Loader2, Upload } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { VrmCustomizer } from "@/modules/studio/components/VrmCustomizer";
import { VroidSync } from "@/modules/studio/components/VroidSync";
import type { VrmConfig, VrmProfile } from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import {
  SliderField,
  useImageImport,
} from "@/modules/studio/components/fields";
import {
  DROP_ATTR,
  pickModel,
  useDropTarget,
} from "@/modules/studio/lib/files";

export const VRM_DROP_ID = "vrm:model";

type Props = { profile: VrmProfile; dropHover: string | null };

export function VrmEditor({ profile, dropHover }: Props) {
  const update = useProfiles((s) => s.update);
  const { vrm } = profile;
  const patch = (next: Partial<VrmConfig>) =>
    update(profile.id, (p) =>
      p.kind === "vrm" ? { ...p, vrm: { ...p.vrm, ...next } } : p,
    );

  const importer = useImageImport(
    profile.id,
    (model) => patch({ model }),
    "model",
  );
  useDropTarget(VRM_DROP_ID, (path) => {
    if (!importer.isPending) importer.mutate(path);
  });

  const pick = async () => {
    const path = await pickModel();
    if (path) importer.mutate(path);
  };

  return (
    <div className="flex flex-col gap-5">
      <button
        type="button"
        {...{ [DROP_ATTR]: VRM_DROP_ID }}
        onClick={pick}
        disabled={importer.isPending}
        className={cn(
          "flex items-center gap-3 rounded-xl border border-dashed border-border p-4 text-left transition outline-none hover:border-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
          dropHover === VRM_DROP_ID && "border-primary bg-primary/10",
        )}
      >
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
          {importer.isPending ? (
            <Loader2 className="size-5 animate-spin" aria-hidden />
          ) : (
            <Box className="size-5 text-primary" aria-hidden />
          )}
        </span>
        <span className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium">
            {importer.isPending
              ? "Import du modèle…"
              : vrm.model
                ? "Remplacer le modèle"
                : "Importer un modèle .vrm"}
          </span>
          <span className="text-xs text-muted-foreground">
            Clique ou glisse un fichier .vrm (VRoid Studio, Booth). 150 Mo
            maximum.
          </span>
        </span>
        <Upload
          className="ml-auto size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </button>

      {vrm.model ? (
        <>
          <SliderField
            label="Ouverture de la bouche"
            value={vrm.mouth}
            min={0}
            max={2}
            onChange={(mouth) => patch({ mouth })}
          />
          <SliderField
            label="Clignement des yeux"
            value={vrm.eyes}
            min={0}
            max={2}
            onChange={(eyes) => patch({ eyes })}
          />
          <SliderField
            label="Émotions (sourire, surprise)"
            value={vrm.emotion}
            min={0}
            max={2}
            onChange={(emotion) => patch({ emotion })}
          />
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="vrm-gestures">Suivre mes bras et mes mains</Label>
              <span className="text-xs leading-relaxed text-muted-foreground">
                Quand tes mains sont visibles à la caméra, l'avatar reprend tes
                gestes et la fermeture de tes doigts. Recule un peu pour que tes
                coudes soient dans le cadre.
              </span>
            </div>
            <Switch
              id="vrm-gestures"
              checked={vrm.gestures}
              onCheckedChange={(v) => patch({ gestures: Boolean(v) })}
            />
          </div>
          <SliderField
            label="Position des bras au repos"
            value={vrm.arms}
            min={0}
            max={1.5}
            format={(v) => `${Math.round((v * 180) / Math.PI)}°`}
            onChange={(arms) => patch({ arms })}
          />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Le cadrage (taille, position) se règle dans l'onglet Mouvement.
            Respecte la licence du modèle : beaucoup de VRM gratuits interdisent
            l'usage commercial ou la modification.
          </p>
        </>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Tu peux créer ton propre avatar gratuitement avec VRoid Studio, puis
          l'exporter en .vrm.
        </p>
      )}
      <VroidSync profile={profile} patch={patch} />
      {vrm.model ? <VrmCustomizer profile={profile} patch={patch} /> : null}
    </div>
  );
}
