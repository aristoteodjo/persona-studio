import { ChevronDown, Eye, EyeOff, RotateCcw, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
import { patternPreview } from "@/modules/avatar/vrm/patterns";
import {
  PATTERNS,
  type Pattern,
  type PatternType,
  patternSchema,
  VRM_REST_EXPRESSIONS,
  type VrmConfig,
  type VrmCustom,
  type VrmProfile,
} from "@/modules/profiles/schema";
import { SliderField } from "@/modules/studio/components/fields";
import { MOOD_LABEL } from "@/modules/studio/lib/quick-actions";

const PATTERN_LABEL: Record<PatternType, string> = {
  stripes: "Rayures",
  dots: "Pois",
  checks: "Carreaux",
  stars: "Étoiles",
  hearts: "Cœurs",
  zigzag: "Zigzag",
};

type PartCfg = VrmCustom["materials"][string];
const EMPTY: PartCfg = { color: null, hidden: false, pattern: null };

function Swatch({ pattern }: { pattern: Pattern }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, 40, 40);
    ctx.drawImage(patternPreview(pattern, 40), 0, 0);
  }, [pattern]);
  return (
    <canvas
      ref={ref}
      width={40}
      height={40}
      className="size-7 rounded"
      aria-hidden
    />
  );
}

function PartRow({
  part,
  cfg,
  onChange,
}: {
  part: ModelPart;
  cfg: PartCfg;
  onChange: (next: Partial<PartCfg>) => void;
}) {
  const [open, setOpen] = useState(false);
  const pattern = cfg.pattern;
  const setPattern = (next: Partial<Pattern>) =>
    onChange({
      pattern: patternSchema.parse({
        ...(pattern ?? { type: "stripes" }),
        ...next,
      }),
    });

  return (
    <li
      className={cn(
        "rounded-lg",
        open && "bg-muted/40 p-2",
        cfg.hidden && "opacity-50",
      )}
    >
      <div className="flex items-center gap-2">
        <input
          type="color"
          aria-label={`Couleur de ${part.label}`}
          value={cfg.color ?? part.color}
          onChange={(e) => onChange({ color: e.target.value })}
          className="h-7 w-9 shrink-0 cursor-pointer rounded border border-border bg-transparent"
        />
        <span className="min-w-0 flex-1 truncate text-xs" title={part.key}>
          {part.label}
        </span>
        {cfg.color || pattern ? (
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={`Rétablir ${part.label}`}
            onClick={() => onChange({ color: null, pattern: null })}
          >
            <RotateCcw />
          </Button>
        ) : null}
        <Button
          size="icon-sm"
          variant={pattern ? "secondary" : "ghost"}
          aria-expanded={open}
          aria-label={`Motif de ${part.label}`}
          onClick={() => setOpen(!open)}
        >
          {open ? <ChevronDown /> : <Sparkles />}
        </Button>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-pressed={cfg.hidden}
          aria-label={
            cfg.hidden ? `Afficher ${part.label}` : `Masquer ${part.label}`
          }
          onClick={() => onChange({ hidden: !cfg.hidden })}
        >
          {cfg.hidden ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 flex flex-col gap-3">
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="mb-1.5 text-xs text-muted-foreground">
              Motif
            </legend>
            <Button
              size="sm"
              variant={pattern ? "secondary" : "default"}
              onClick={() => onChange({ pattern: null })}
            >
              Aucun
            </Button>
            {PATTERNS.map((t) => (
              <Button
                key={t}
                size="sm"
                variant={pattern?.type === t ? "default" : "secondary"}
                aria-pressed={pattern?.type === t}
                onClick={() => setPattern({ type: t })}
              >
                {PATTERN_LABEL[t]}
              </Button>
            ))}
          </fieldset>
          {pattern ? (
            <>
              <div className="flex items-center gap-3">
                <Swatch pattern={pattern} />
                <Label htmlFor={`pc-${part.key}`} className="flex-1">
                  Couleur du motif
                </Label>
                <input
                  id={`pc-${part.key}`}
                  type="color"
                  value={pattern.color}
                  onChange={(e) => setPattern({ color: e.target.value })}
                  className="h-7 w-9 cursor-pointer rounded border border-border bg-transparent"
                />
              </div>
              <SliderField
                label="Taille"
                value={pattern.scale}
                min={0.2}
                max={4}
                onChange={(scale) => setPattern({ scale })}
              />
              <SliderField
                label="Angle"
                value={pattern.angle}
                min={-90}
                max={90}
                step={1}
                format={(v) => `${Math.round(v)}°`}
                onChange={(angle) => setPattern({ angle })}
              />
              <SliderField
                label="Opacité"
                value={pattern.opacity}
                min={0}
                max={1}
                onChange={(opacity) => setPattern({ opacity })}
              />
            </>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

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
  const setPart = (key: string, next: Partial<PartCfg>) => {
    const prev = custom.materials[key] ?? EMPTY;
    setCustom({
      materials: { ...custom.materials, [key]: { ...prev, ...next } },
    });
  };

  const parts = info.profileId === profile.id ? info.parts : [];
  const groups = GROUP_ORDER.map((g) => ({
    g,
    items: parts.filter((p) => p.group === g),
  })).filter((x) => x.items.length > 0);

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
            La couleur recolore la texture en gardant ses ombres. Le bouton
            étincelle ajoute un motif.
          </p>
          {groups.map(({ g, items }) => (
            <div key={g} className="flex flex-col gap-2">
              <h4 className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                {GROUP_LABEL[g]}
              </h4>
              <ul className="flex flex-col gap-1.5">
                {items.map((p) => (
                  <PartRow
                    key={p.key}
                    part={p}
                    cfg={custom.materials[p.key] ?? EMPTY}
                    onChange={(next) => setPart(p.key, next)}
                  />
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
    </section>
  );
}
