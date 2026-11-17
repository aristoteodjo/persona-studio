import { Shuffle } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import {
  CREATOR_ACCESSORIES,
  CREATOR_EYES,
  CREATOR_HAIR,
  CREATOR_OUTFITS,
  type CreatorConfig,
  type CreatorProfile,
} from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import { SliderField } from "@/modules/studio/components/fields";

const HAIR_LABEL: Record<CreatorConfig["hair"]["style"], string> = {
  short: "Courts",
  bob: "Carré",
  long: "Longs",
  twintails: "Couettes",
  ponytail: "Queue",
  spiky: "En pics",
};
const EYES_LABEL: Record<CreatorConfig["eyes"]["style"], string> = {
  round: "Ronds",
  sharp: "Perçants",
  sleepy: "Endormis",
};
const OUTFIT_LABEL: Record<CreatorConfig["outfit"]["style"], string> = {
  hoodie: "Sweat",
  tee: "T-shirt",
  sailor: "Marin",
  jacket: "Veste",
};
const ACCESSORY_LABEL: Record<CreatorConfig["accessories"][number], string> = {
  catEars: "Oreilles de chat",
  glasses: "Lunettes",
  headphones: "Casque",
  horns: "Cornes",
};

const SKINS = ["#fbe3d0", "#f2c9a8", "#d9a37c", "#a8714a", "#6e4630"];
const HAIRS = [
  "#3b2a4a",
  "#1d1a1f",
  "#d8a64a",
  "#e8576f",
  "#5bb7e8",
  "#f2f0ea",
];
const EYE_COLORS = ["#3f7fd9", "#5aa457", "#9b5bd6", "#d94f4f", "#7a4b2a"];

const pick = <T,>(list: readonly T[]) =>
  list[Math.floor(Math.random() * list.length)] as T;
const randomHex = () =>
  `#${Math.floor(Math.random() * 0xffffff)
    .toString(16)
    .padStart(6, "0")}`;

function Choice<T extends string>({
  label,
  value,
  options,
  names,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  names: Record<T, string>;
  onChange: (v: T) => void;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2">
      <Label id={id}>{label}</Label>
      <div
        role="radiogroup"
        aria-labelledby={id}
        className="flex flex-wrap gap-1.5"
      >
        {options.map((o) => (
          // biome-ignore lint/a11y/useSemanticElements: segmented control
          <button
            key={o}
            type="button"
            role="radio"
            aria-checked={o === value}
            onClick={() => onChange(o)}
            className={cn(
              "rounded-md border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              o === value
                ? "border-primary bg-primary/15 text-foreground"
                : "border-border text-muted-foreground hover:bg-muted",
            )}
          >
            {names[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

function ColorRow({
  label,
  value,
  swatches,
  onChange,
}: {
  label: string;
  value: string;
  swatches: string[];
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-1.5">
        {swatches.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`${label} ${c}`}
            onClick={() => onChange(c)}
            className={cn(
              "size-5 rounded-full border border-black/20 outline-none focus-visible:ring-2 focus-visible:ring-ring",
              c === value && "ring-2 ring-primary",
            )}
            style={{ background: c }}
          />
        ))}
        <input
          id={id}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded-md border border-border bg-transparent"
        />
      </div>
    </div>
  );
}

type Props = { profile: CreatorProfile };

export function CreatorEditor({ profile }: Props) {
  const update = useProfiles((s) => s.update);
  const c = profile.creator;
  const patch = (next: Partial<CreatorConfig>) =>
    update(profile.id, (p) =>
      p.kind === "creator" ? { ...p, creator: { ...p.creator, ...next } } : p,
    );

  const shuffle = () =>
    patch({
      skin: pick(SKINS),
      hair: { style: pick(CREATOR_HAIR), color: pick(HAIRS) },
      eyes: {
        style: pick(CREATOR_EYES),
        color: pick(EYE_COLORS),
        size: 0.85 + Math.random() * 0.4,
      },
      outfit: {
        style: pick(CREATOR_OUTFITS),
        color: randomHex(),
        accent: pick(["#f4efe6", "#1d1a1f", randomHex()]),
      },
      accessories: CREATOR_ACCESSORIES.filter(() => Math.random() < 0.25),
      blush: Math.random() < 0.7,
    });

  const toggleAccessory = (a: CreatorConfig["accessories"][number]) =>
    patch({
      accessories: c.accessories.includes(a)
        ? c.accessories.filter((x) => x !== a)
        : [...c.accessories, a],
    });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Compose ton avatar pièce par pièce. Tout est généré dans l'app : pas
          de fichier à importer.
        </p>
        <Button size="sm" variant="outline" onClick={shuffle}>
          <Shuffle /> Au hasard
        </Button>
      </div>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Visage</h3>
        <ColorRow
          label="Peau"
          value={c.skin}
          swatches={SKINS}
          onChange={(skin) => patch({ skin })}
        />
        <Choice
          label="Yeux"
          value={c.eyes.style}
          options={CREATOR_EYES}
          names={EYES_LABEL}
          onChange={(style) => patch({ eyes: { ...c.eyes, style } })}
        />
        <ColorRow
          label="Couleur des yeux"
          value={c.eyes.color}
          swatches={EYE_COLORS}
          onChange={(color) => patch({ eyes: { ...c.eyes, color } })}
        />
        <SliderField
          label="Taille des yeux"
          value={c.eyes.size}
          min={0.7}
          max={1.4}
          onChange={(size) => patch({ eyes: { ...c.eyes, size } })}
        />
        <div className="flex items-center justify-between">
          <Label htmlFor="creator-blush">Joues roses</Label>
          <Switch
            id="creator-blush"
            checked={c.blush}
            onCheckedChange={(v) => patch({ blush: Boolean(v) })}
          />
        </div>
        <SliderField
          label="Taille de la tête"
          value={c.headScale}
          min={0.85}
          max={1.25}
          onChange={(headScale) => patch({ headScale })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Cheveux</h3>
        <Choice
          label="Coiffure"
          value={c.hair.style}
          options={CREATOR_HAIR}
          names={HAIR_LABEL}
          onChange={(style) => patch({ hair: { ...c.hair, style } })}
        />
        <ColorRow
          label="Couleur"
          value={c.hair.color}
          swatches={HAIRS}
          onChange={(color) => patch({ hair: { ...c.hair, color } })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Tenue</h3>
        <Choice
          label="Haut"
          value={c.outfit.style}
          options={CREATOR_OUTFITS}
          names={OUTFIT_LABEL}
          onChange={(style) => patch({ outfit: { ...c.outfit, style } })}
        />
        <ColorRow
          label="Couleur principale"
          value={c.outfit.color}
          swatches={["#e86a33", "#3a4a8c", "#2f7a5a", "#1d1a1f", "#f2f0ea"]}
          onChange={(color) => patch({ outfit: { ...c.outfit, color } })}
        />
        <ColorRow
          label="Détails"
          value={c.outfit.accent}
          swatches={["#f4efe6", "#1d1a1f", "#e8b84a"]}
          onChange={(accent) => patch({ outfit: { ...c.outfit, accent } })}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Accessoires</h3>
        <div className="flex flex-wrap gap-1.5">
          {CREATOR_ACCESSORIES.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={c.accessories.includes(a)}
              onClick={() => toggleAccessory(a)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                c.accessories.includes(a)
                  ? "border-primary bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {ACCESSORY_LABEL[a]}
            </button>
          ))}
        </div>
        {c.accessories.some((a) => a !== "catEars") ? (
          <ColorRow
            label="Couleur des accessoires"
            value={c.accessoryColor}
            swatches={["#2b2b33", "#e8b84a", "#f2f0ea", "#d6334a"]}
            onChange={(accessoryColor) => patch({ accessoryColor })}
          />
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Animation</h3>
        <SliderField
          label="Ouverture de la bouche"
          value={c.mouth}
          min={0}
          max={2}
          onChange={(mouth) => patch({ mouth })}
        />
        <SliderField
          label="Clignement des yeux"
          value={c.eyesAmount}
          min={0}
          max={2}
          onChange={(eyesAmount) => patch({ eyesAmount })}
        />
      </section>
    </div>
  );
}
