import { Eye, EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { type ModelPart, useVrmModelInfo } from "@/modules/avatar/vrm/custom";
import { GROUP_LABEL, GROUP_ORDER } from "@/modules/avatar/vrm/materials";
import {
  VRM_REST_EXPRESSIONS,
  type VrmConfig,
  type VrmCustom,
  type VrmProfile,
} from "@/modules/profiles/schema";
import { SliderField } from "@/modules/studio/components/fields";

const MOOD_LABEL: Record<VrmCustom["restExpression"], string> = {
  neutral: "Neutre",
  happy: "Joyeux",
  relaxed: "Détendu",
  angry: "Fâché",
  sad: "Triste",
  surprised: "Surpris",
};

type Props = {
  profile: VrmProfile;
  patch: (next: Partial<VrmConfig>) => void;
};

/** Tweaks the loaded model without leaving the app; stored per persona, applied in OBS too. */
export function VrmCustomizer({ profile, patch }: Props) {
  const info = useVrmModelInfo();
  const custom = profile.vrm.custom;
  const setCustom = (next: Partial<VrmCustom>) =>
    patch({ custom: { ...custom, ...next } });
  const setPart = (
    key: string,
    next: { color?: string | null; hidden?: boolean },
  ) => {
    const prev = custom.materials[key] ?? { color: null, hidden: false };
    setCustom({
      materials: { ...custom.materials, [key]: { ...prev, ...next } },
    });
  };

  const parts = info.profileId === profile.id ? info.parts : [];
  const groups = GROUP_ORDER.map((g) => ({
    g,
    items: parts.filter((p) => p.group === g),
  })).filter((x) => x.items.length > 0);

  const row = (p: ModelPart) => {
    const cfg = custom.materials[p.key];
    const hidden = cfg?.hidden ?? false;
    return (
      <li
        key={p.key}
        className={cn("flex items-center gap-2", hidden && "opacity-50")}
      >
        <input
          type="color"
          aria-label={`Teinte de ${p.label}`}
          value={cfg?.color ?? p.color}
          onChange={(e) => setPart(p.key, { color: e.target.value })}
          className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent"
        />
        <span className="min-w-0 flex-1 truncate text-xs" title={p.key}>
          {p.label}
        </span>
        {cfg?.color ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Couleur d'origine pour ${p.label}`}
            onClick={() => setPart(p.key, { color: null })}
          >
            <RotateCcw />
          </Button>
        ) : null}
        <Button
          size="icon-sm"
          variant="ghost"
          aria-pressed={hidden}
          aria-label={hidden ? `Afficher ${p.label}` : `Masquer ${p.label}`}
          onClick={() => setPart(p.key, { hidden: !hidden })}
        >
          {hidden ? <EyeOff /> : <Eye />}
        </Button>
      </li>
    );
  };

  return (
    <section className="flex flex-col gap-4" aria-labelledby="vrm-custom">
      <div className="flex items-center justify-between">
        <h3 id="vrm-custom" className="text-sm font-semibold">
          Personnaliser
        </h3>
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            setCustom({
              materials: {},
              headScale: 1,
              restExpression: "neutral",
              restWeight: 0.5,
            })
          }
        >
          <RotateCcw /> Tout réinitialiser
        </Button>
      </div>
      <div className="flex items-center justify-between gap-4">
        <Label>Humeur au repos</Label>
        <Select
          value={custom.restExpression}
          onValueChange={(v) =>
            setCustom({ restExpression: v as VrmCustom["restExpression"] })
          }
        >
          <SelectTrigger
            size="sm"
            className="w-36"
            aria-label="Humeur au repos"
          >
            <SelectValue>
              {(v: VrmCustom["restExpression"]) => MOOD_LABEL[v]}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {VRM_REST_EXPRESSIONS.map((e) => (
              <SelectItem key={e} value={e}>
                {MOOD_LABEL[e]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {custom.restExpression !== "neutral" ? (
        <SliderField
          label="Intensité de l'humeur"
          value={custom.restWeight}
          min={0}
          max={1}
          onChange={(restWeight) => setCustom({ restWeight })}
        />
      ) : null}
      <SliderField
        label="Taille de la tête"
        value={custom.headScale}
        min={0.8}
        max={1.3}
        onChange={(headScale) => setCustom({ headScale })}
      />
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Les parties du modèle apparaissent une fois l'avatar chargé dans
          l'aperçu.
        </p>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-muted-foreground">
            La teinte se multiplie avec la texture d'origine : elle colore
            fortement les parties claires et assombrit les parties déjà
            colorées.
          </p>
          {groups.map(({ g, items }) => (
            <div key={g} className="flex flex-col gap-2">
              <h4 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {GROUP_LABEL[g]}
              </h4>
              <ul className="flex flex-col gap-1.5">{items.map(row)}</ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
