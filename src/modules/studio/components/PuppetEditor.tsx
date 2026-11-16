import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { mediaUrl } from "@/modules/avatar";
import { mediaBase } from "@/modules/overlay-link";
import {
  FACE_LANDMARK_COUNT,
  isPuppetReady,
  type PuppetConfig,
  type PuppetProfile,
} from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import {
  ImageSlot,
  SliderField,
  useImageImport,
} from "@/modules/studio/components/fields";
import { detectFaceOnImage } from "@/modules/tracking";

export const PUPPET_DROP_ID = "puppet:image";

type Props = { profile: PuppetProfile; dropHover: string | null };

export function PuppetEditor({ profile, dropHover }: Props) {
  const update = useProfiles((s) => s.update);
  const { puppet } = profile;

  const patch = (next: Partial<PuppetConfig>) =>
    update(profile.id, (p) =>
      p.kind === "puppet" ? { ...p, puppet: { ...p.puppet, ...next } } : p,
    );

  const detect = useMutation({
    mutationFn: (file: string) =>
      detectFaceOnImage(mediaUrl(mediaBase(), profile.id, file)).then(
        (face) => ({ file, face }),
      ),
    onSuccess: ({ file, face }) => {
      if (!face) {
        patch({ image: file, landmarks: [], width: null, height: null });
        return;
      }
      if (
        face.landmarks.length !== FACE_LANDMARK_COUNT * 3 ||
        face.width <= 0 ||
        face.height <= 0
      ) {
        toast.error("Détection incomplète", {
          description: "Réessaie avec une autre image.",
        });
        return;
      }
      patch({
        image: file,
        landmarks: face.landmarks,
        width: face.width,
        height: face.height,
      });
    },
    onError: (e) =>
      toast.error("Détection impossible", { description: String(e) }),
  });

  const importer = useImageImport(profile.id, (file) => {
    patch({ image: file, landmarks: [], width: null, height: null });
    detect.mutate(file);
  });

  const ready = isPuppetReady(puppet);
  const failed = puppet.image !== null && !ready && !detect.isPending;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-[8rem_1fr] gap-4">
        <ImageSlot
          profileId={profile.id}
          file={puppet.image}
          label="Portrait"
          hint="Visage de face, bien visible"
          dropId={PUPPET_DROP_ID}
          dropHover={dropHover === PUPPET_DROP_ID}
          onChange={(file) =>
            patch({ image: file, landmarks: [], width: null, height: null })
          }
          busy={detect.isPending}
          importer={importer}
        />
        <div className="flex flex-col gap-2 text-xs leading-relaxed">
          {detect.isPending ? (
            <p className="text-muted-foreground">
              Recherche du visage sur l'image…
            </p>
          ) : ready ? (
            <p className="flex items-start gap-1.5 text-live">
              <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Visage détecté. L'avatar suit ta tête, tes yeux, ta bouche et tes
              sourcils.
            </p>
          ) : failed ? (
            <p
              role="alert"
              className="flex items-start gap-1.5 text-destructive"
            >
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Aucun visage reconnu. Essaie un portrait de face, plus grand dans
              le cadre et bien éclairé. Pour un personnage très stylisé, préfère
              un profil 2D.
            </p>
          ) : (
            <p className="text-muted-foreground">
              Importe un portrait de face. Le visage est repéré une seule fois,
              à l'import, puis animé en direct.
            </p>
          )}
          {puppet.image && !detect.isPending ? (
            <Button
              size="sm"
              variant="ghost"
              className="self-start"
              onClick={() => puppet.image && detect.mutate(puppet.image)}
            >
              <RefreshCw /> Relancer la détection
            </Button>
          ) : null}
        </div>
      </div>

      <SliderField
        label="Ouverture de la bouche"
        value={puppet.mouth}
        min={0}
        max={2}
        onChange={(mouth) => patch({ mouth })}
      />
      <SliderField
        label="Clignement des yeux"
        value={puppet.eyes}
        min={0}
        max={2}
        onChange={(eyes) => patch({ eyes })}
      />
      <SliderField
        label="Sourcils"
        value={puppet.brows}
        min={0}
        max={2}
        onChange={(brows) => patch({ brows })}
      />
      <div className="flex items-center justify-between">
        <Label htmlFor="mouth-color">Intérieur de la bouche</Label>
        <input
          id="mouth-color"
          type="color"
          value={puppet.mouthColor}
          onChange={(e) => patch({ mouthColor: e.target.value })}
          className="h-8 w-12 cursor-pointer rounded-md border border-border bg-transparent"
        />
      </div>
    </div>
  );
}
