import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LIGHTING_LABEL } from "@/modules/avatar/lighting";
import { LIGHTINGS, type Profile, type Scene } from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import {
  ImageSlot,
  SliderField,
  useImageImport,
} from "@/modules/studio/components/fields";

const KINDS: { kind: Scene["background"]["kind"]; label: string }[] = [
  { kind: "none", label: "Transparent" },
  { kind: "color", label: "Couleur" },
  { kind: "gradient", label: "Dégradé" },
  { kind: "image", label: "Image" },
];

const PRESETS: {
  label: string;
  bg: Partial<Scene["background"]>;
  lighting?: Scene["lighting"];
}[] = [
  {
    label: "Crépuscule",
    bg: { kind: "gradient", color: "#2b1b4a", color2: "#f08a4b", angle: 170 },
    lighting: "sunset",
  },
  {
    label: "Néon",
    bg: { kind: "gradient", color: "#0b0b2a", color2: "#c2187a", angle: 135 },
    lighting: "neon",
  },
  {
    label: "Pastel",
    bg: { kind: "gradient", color: "#fde2e4", color2: "#cddafd", angle: 160 },
    lighting: "soft",
  },
  {
    label: "Nuit",
    bg: { kind: "gradient", color: "#05070f", color2: "#1d2a5a", angle: 180 },
    lighting: "night",
  },
  { label: "Fond vert", bg: { kind: "color", color: "#00b140" } },
];

const SWITCH_ID = "scene-bg";

export function SceneEditor({
  profile,
  dropHover,
}: {
  profile: Profile;
  dropHover: string | null;
}) {
  const update = useProfiles((s) => s.update);
  const scene = profile.scene;
  const bg = scene.background;
  const set = (next: Partial<Scene>) =>
    update(profile.id, (p) => ({ ...p, scene: { ...p.scene, ...next } }));
  const setBg = (next: Partial<Scene["background"]>) =>
    set({ background: { ...bg, ...next } });
  const importer = useImageImport(profile.id, (image) =>
    setBg({ kind: "image", image }),
  );

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3" aria-labelledby="scene-presets">
        <h3 id="scene-presets" className="text-sm font-semibold">
          Ambiances prêtes
        </h3>
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              size="sm"
              variant="secondary"
              onClick={() =>
                set({
                  background: { ...bg, ...p.bg },
                  ...(p.lighting ? { lighting: p.lighting } : {}),
                })
              }
            >
              {p.label}
            </Button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4" aria-labelledby={SWITCH_ID}>
        <h3 id={SWITCH_ID} className="text-sm font-semibold">
          Fond
        </h3>
        <fieldset className="grid grid-cols-4 gap-1.5">
          <legend className="sr-only">Type de fond</legend>
          {KINDS.map((k) => (
            <Button
              key={k.kind}
              size="sm"
              variant={bg.kind === k.kind ? "default" : "secondary"}
              aria-pressed={bg.kind === k.kind}
              onClick={() => setBg({ kind: k.kind })}
            >
              {k.label}
            </Button>
          ))}
        </fieldset>
        {bg.kind === "color" || bg.kind === "gradient" ? (
          <div className="flex items-center gap-4">
            <Label htmlFor="bg-c1">
              {bg.kind === "gradient" ? "Couleurs" : "Couleur"}
            </Label>
            <input
              id="bg-c1"
              type="color"
              value={bg.color}
              onChange={(e) => setBg({ color: e.target.value })}
              className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
            />
            {bg.kind === "gradient" ? (
              <input
                aria-label="Seconde couleur"
                type="color"
                value={bg.color2}
                onChange={(e) => setBg({ color2: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-border bg-transparent"
              />
            ) : null}
          </div>
        ) : null}
        {bg.kind === "gradient" ? (
          <SliderField
            label="Direction"
            value={bg.angle}
            min={0}
            max={360}
            step={1}
            format={(v) => `${Math.round(v)}°`}
            onChange={(angle) => setBg({ angle })}
          />
        ) : null}
        {bg.kind === "image" ? (
          <ImageSlot
            className="w-40"
            profileId={profile.id}
            file={bg.image}
            label="Image de fond"
            hint="Chambre, paysage, ciel…"
            dropId="scene:image"
            dropHover={dropHover === "scene:image"}
            onChange={(image) => setBg({ image })}
            importer={importer}
          />
        ) : null}
        <p className="text-xs leading-relaxed text-muted-foreground">
          Le décor apparaît aussi dans OBS. Garde « Transparent » si ton décor
          est une autre source OBS.
        </p>
      </section>

      {profile.kind === "vrm" ? (
        <section className="flex flex-col gap-4" aria-labelledby="scene-light">
          <h3 id="scene-light" className="text-sm font-semibold">
            Lumière
          </h3>
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only">Ambiance lumineuse</legend>
            {LIGHTINGS.map((l) => (
              <Button
                key={l}
                size="sm"
                variant={scene.lighting === l ? "default" : "secondary"}
                aria-pressed={scene.lighting === l}
                onClick={() => set({ lighting: l })}
              >
                {LIGHTING_LABEL[l]}
              </Button>
            ))}
          </fieldset>
          <SliderField
            label="Intensité"
            value={scene.light}
            min={0.3}
            max={2}
            onChange={(light) => set({ light })}
          />
        </section>
      ) : null}
    </div>
  );
}
