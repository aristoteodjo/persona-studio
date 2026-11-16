import { useMutation } from "@tanstack/react-query";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useId } from "react";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { mediaUrl } from "@/modules/avatar";
import { mediaBase } from "@/modules/overlay-link";
import { useProfiles } from "@/modules/profiles/store";
import {
  DROP_ATTR,
  pickImage,
  useDropTarget,
} from "@/modules/studio/lib/files";

type SliderFieldProps = {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
};

export function SliderField({
  label,
  value,
  min,
  max,
  step = 0.01,
  format = (v) => `${Math.round(v * 100)} %`,
  onChange,
}: SliderFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <Label id={id}>{label}</Label>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          {format(value)}
        </span>
      </div>
      <Slider
        aria-labelledby={id}
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? (v[0] ?? value) : v)}
      />
    </div>
  );
}

/** Uploads a picked or dropped file into the profile folder and returns its media name. */
export function useImageImport(
  profileId: string,
  onImported: (name: string) => void,
  accept: "image" | "model" = "image",
) {
  const importImage = useProfiles((s) => s.importImage);
  return useMutation({
    mutationFn: (path: string) => importImage(profileId, path),
    onSuccess: (name) => {
      if (
        typeof name !== "string" ||
        !(
          accept === "model"
            ? /^[0-9a-f-]{36}\.vrm$/
            : /^[0-9a-f-]{36}\.(png|jpg|webp|gif)$/
        ).test(name)
      ) {
        toast.error("Import inattendu", {
          description: "Le fichier importé n'a pas été reconnu.",
        });
        return;
      }
      onImported(name);
    },
    onError: (e) =>
      toast.error("Import impossible", { description: String(e) }),
  });
}

type ImageSlotProps = {
  profileId: string;
  file: string | null;
  label: string;
  hint?: string;
  dropId: string;
  dropHover: boolean;
  onChange: (file: string | null) => void;
  className?: string;
  busy?: boolean;
  importer: ReturnType<typeof useImageImport>;
};

export function ImageSlot({
  profileId,
  file,
  label,
  hint,
  dropId,
  dropHover,
  onChange,
  className,
  busy,
  importer,
}: ImageSlotProps) {
  const base = mediaBase();
  const pending = importer.isPending || busy;
  useDropTarget(dropId, (path) => {
    if (!pending) importer.mutate(path);
  });

  const pick = async () => {
    const path = await pickImage();
    if (path) importer.mutate(path);
  };

  return (
    <div className={cn("group relative flex flex-col gap-1.5", className)}>
      <button
        type="button"
        {...{ [DROP_ATTR]: dropId }}
        onClick={pick}
        disabled={pending}
        aria-label={
          file
            ? `Remplacer l'image « ${label} »`
            : `Ajouter l'image « ${label} »`
        }
        className={cn(
          "checker relative aspect-square w-full overflow-hidden rounded-lg ring-1 ring-border transition outline-none hover:ring-primary/60 focus-visible:ring-2 focus-visible:ring-ring",
          dropHover && "ring-2 ring-primary",
        )}
      >
        {file && base ? (
          <img
            src={mediaUrl(base, profileId, file)}
            alt=""
            className="size-full object-contain"
            draggable={false}
          />
        ) : (
          <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImagePlus className="size-5" aria-hidden />
            {hint ? (
              <span className="px-2 text-center text-[10px] leading-tight">
                {hint}
              </span>
            ) : null}
          </span>
        )}
        {pending ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2
              className="size-5 animate-spin"
              aria-label="Import en cours"
            />
          </span>
        ) : null}
      </button>
      {file && !pending ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Retirer l'image « ${label} »`}
          className="absolute top-1 right-1 rounded-md bg-background/85 p-1 opacity-0 transition group-hover:opacity-100 focus-visible:opacity-100"
        >
          <X className="size-3" />
        </button>
      ) : null}
      <span className="text-center text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
