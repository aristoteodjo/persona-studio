import { useMutation } from "@tanstack/react-query";
import {
  Box,
  Eye,
  Footprints,
  Glasses,
  Loader2,
  type LucideIcon,
  Palette,
  Play,
  Plus,
  RotateCcw,
  RotateCw,
  Scissors,
  Settings2,
  Shirt,
  Shuffle,
  Smile,
  Sparkles,
} from "lucide-react";
import {
  lazy,
  type PointerEvent,
  type ReactNode,
  Suspense,
  useCallback,
  useRef,
  useState,
  type WheelEvent,
} from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { Framing, OrbitView } from "@/modules/avatar/orbit";
import { useVrmModelInfo } from "@/modules/avatar/vrm/custom";
import {
  GROUP_LABEL,
  GROUP_ORDER,
  type PartGroup,
} from "@/modules/avatar/vrm/materials";
import { mediaBase } from "@/modules/overlay-link";
import type {
  CreatorProfile,
  Profile,
  VrmProfile,
} from "@/modules/profiles/schema";
import { useProfiles } from "@/modules/profiles/store";
import { idleFrame, type RigFrame } from "@/modules/rig/rig";
import {
  AccessoryFields,
  AnimationFields,
  BodyFields,
  EyesFields,
  FaceFields,
  HairFields,
  OutfitFields,
  randomCreator,
  useCreatorPatch,
} from "@/modules/studio/components/CreatorEditor";
import {
  EMPTY_PART,
  PartRow,
  useVrmCustom,
  VrmGeneralFields,
} from "@/modules/studio/components/VrmCustomizer";
import { getLiveFrame } from "@/modules/tracking";

const CreatorView = lazy(() => import("@/modules/avatar/creator/CreatorView"));
const VrmView = lazy(() => import("@/modules/avatar/vrm/VrmView"));

const FRAMING_LABEL: Record<Framing, string> = {
  face: "Visage",
  bust: "Buste",
  body: "Corps entier",
};

type Editable = CreatorProfile | VrmProfile;
const isEditable = (p: Profile): p is Editable =>
  p.kind === "creator" || (p.kind === "vrm" && p.vrm.model !== null);

type Props = {
  profiles: Profile[];
  initialId: string | null;
  onUse: (id: string) => void;
};

/** The in-app avatar workshop: creations and imported VRM models, edited on a large orbit preview. */
export function AtelierView({ profiles, initialId, onUse }: Props) {
  const editable = profiles.filter(isEditable);
  const creations = editable.filter((p) => p.kind === "creator");
  const models = editable.filter((p) => p.kind === "vrm");
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const selected =
    editable.find((p) => p.id === selectedId) ?? editable[0] ?? null;

  const create = useMutation({
    mutationFn: () =>
      useProfiles
        .getState()
        .create(`Création ${creations.length + 1}`, "creator"),
    onSuccess: (profile) => {
      if (profile?.kind !== "creator" || typeof profile.id !== "string") {
        toast.error("Création inattendue");
        return;
      }
      setSelectedId(profile.id);
    },
    onError: (e) =>
      toast.error("Création impossible", { description: String(e) }),
  });

  const item = (p: Editable) => (
    <li key={p.id}>
      <button
        type="button"
        onClick={() => setSelectedId(p.id)}
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
          selected?.id === p.id && "bg-muted font-medium",
        )}
      >
        {p.kind === "creator" ? (
          <span
            aria-hidden
            className="size-6 shrink-0 rounded-full border border-black/20"
            style={{
              background: `linear-gradient(135deg, ${p.creator.hair.color} 50%, ${p.creator.outfit.color} 50%)`,
            }}
          />
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted">
            <Box className="size-3.5 text-primary" aria-hidden />
          </span>
        )}
        <span className="truncate">{p.name}</span>
      </button>
    </li>
  );

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border/70">
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex items-center justify-between px-4 pt-4 pb-2">
            <h2 className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
              Créations
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => create.mutate()}
              disabled={create.isPending}
            >
              {create.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Plus />
              )}
              Nouvelle
            </Button>
          </div>
          <ul className="flex flex-col gap-1 px-2 pb-3">
            {creations.map(item)}
          </ul>
          {creations.length === 0 ? (
            <p className="px-4 pb-3 text-xs leading-relaxed text-muted-foreground">
              Aucune création pour l'instant.
            </p>
          ) : null}
          <h2 className="px-4 pt-2 pb-2 text-xs font-semibold tracking-wider text-muted-foreground uppercase">
            Modèles importés
          </h2>
          <ul className="flex flex-col gap-1 px-2 pb-3">{models.map(item)}</ul>
          {models.length === 0 ? (
            <p className="px-4 text-xs leading-relaxed text-muted-foreground">
              Importe un .vrm depuis un persona 3D du Studio pour le retoucher
              ici.
            </p>
          ) : null}
        </ScrollArea>
      </aside>

      {selected?.kind === "creator" ? (
        <CreatorWorkbench key={selected.id} profile={selected} onUse={onUse} />
      ) : selected?.kind === "vrm" ? (
        <VrmWorkbench key={selected.id} profile={selected} onUse={onUse} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Palette className="size-8 text-primary" aria-hidden />
          <p className="max-w-sm text-sm text-muted-foreground">
            Crée ton propre avatar 3D pièce par pièce, ou retouche un modèle VRM
            importé : couleurs, motifs, pièces masquées.
          </p>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus /> Nouvelle création
          </Button>
        </div>
      )}
    </div>
  );
}

/** Camera state of the preview; per-frame values live in refs, never in React state. */
function usePreview(initial: Framing) {
  const [framing, setFramingState] = useState<Framing>(initial);
  const [spin, setSpin] = useState(false);
  const [live, setLive] = useState(false);
  const view = useRef<OrbitView>({ yaw: 0, zoom: 1, framing, spin });
  view.current.framing = framing;
  view.current.spin = spin;
  const liveRef = useRef(live);
  liveRef.current = live;
  const idle = useRef(idleFrame());
  const getFrame = useCallback(
    (): RigFrame => (liveRef.current ? getLiveFrame() : idle.current),
    [],
  );
  const setFraming = (f: Framing) => {
    setFramingState(f);
    view.current.zoom = 1;
  };
  return { framing, setFraming, spin, setSpin, live, setLive, view, getFrame };
}

type Preview = ReturnType<typeof usePreview>;

function PreviewPanel({
  preview,
  label,
  children,
}: {
  preview: Preview;
  label: string;
  children: ReactNode;
}) {
  const { view, framing, setFraming, spin, setSpin, live, setLive } = preview;
  const drag = useRef<{ x: number; yaw: number } | null>(null);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, yaw: view.current.yaw };
    setSpin(false);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    view.current.yaw = drag.current.yaw - (e.clientX - drag.current.x) * 0.01;
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onWheel = (e: WheelEvent<HTMLDivElement>) => {
    const z = view.current.zoom * Math.exp(-e.deltaY * 0.0015);
    view.current.zoom = Math.min(Math.max(z, 0.6), 3);
  };
  return (
    <section className="relative flex min-w-0 flex-1 flex-col">
      <div
        className="relative min-h-0 flex-1 cursor-grab touch-none bg-[radial-gradient(ellipse_at_center,var(--muted)_0%,transparent_70%)] active:cursor-grabbing"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        role="img"
        aria-label={label}
      >
        <Suspense
          fallback={
            <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
              Chargement de l'aperçu…
            </div>
          }
        >
          {children}
        </Suspense>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-4 py-2.5">
        <div role="radiogroup" aria-label="Cadrage" className="flex gap-1">
          {(Object.keys(FRAMING_LABEL) as Framing[]).map((f) => (
            // biome-ignore lint/a11y/useSemanticElements: segmented control
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={f === framing}
              onClick={() => setFraming(f)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring",
                f === framing
                  ? "border-primary bg-primary/15"
                  : "border-border text-muted-foreground hover:bg-muted",
              )}
            >
              {FRAMING_LABEL[f]}
            </button>
          ))}
        </div>
        <Button
          size="sm"
          variant={spin ? "default" : "ghost"}
          onClick={() => setSpin(!spin)}
        >
          <RotateCw /> Tourner
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <Label htmlFor="atelier-live" className="text-xs">
            Suivre ma caméra
          </Label>
          <Switch
            id="atelier-live"
            checked={live}
            onCheckedChange={(v) => setLive(Boolean(v))}
          />
        </div>
      </div>
    </section>
  );
}

type Category = { id: string; label: string; icon: LucideIcon };

function CategoryRail({
  categories,
  current,
  onOpen,
}: {
  categories: Category[];
  current: string;
  onOpen: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Catégories"
      className="flex w-20 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/70 py-3"
    >
      {categories.map((c) => (
        <button
          key={c.id}
          type="button"
          aria-pressed={c.id === current}
          onClick={() => onOpen(c.id)}
          className={cn(
            "flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-center text-[11px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
            c.id === current
              ? "bg-primary/15 text-foreground"
              : "text-muted-foreground",
          )}
        >
          <c.icon className="size-4" aria-hidden />
          {c.label}
        </button>
      ))}
    </nav>
  );
}

function SidePanel({
  profile,
  actions,
  title,
  children,
}: {
  profile: Profile;
  actions: ReactNode;
  title: string;
  children: ReactNode;
}) {
  const rename = useProfiles((s) => s.update);
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-border/70">
      <div className="flex flex-col gap-3 border-b border-border/70 p-4">
        <input
          aria-label="Nom"
          value={profile.name}
          maxLength={60}
          onChange={(e) => {
            const name = e.target.value;
            if (name.trim()) rename(profile.id, (p) => ({ ...p, name }));
          }}
          className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <div className="flex gap-2">{actions}</div>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-4">
          <h3 className="text-sm font-semibold">{title}</h3>
          {children}
        </div>
      </ScrollArea>
    </aside>
  );
}

const CREATOR_CATEGORIES = [
  {
    id: "face",
    label: "Visage",
    icon: Smile,
    Fields: FaceFields,
    framing: "face",
  },
  { id: "eyes", label: "Yeux", icon: Eye, Fields: EyesFields, framing: "face" },
  {
    id: "hair",
    label: "Cheveux",
    icon: Scissors,
    Fields: HairFields,
    framing: "bust",
  },
  {
    id: "body",
    label: "Corps",
    icon: Footprints,
    Fields: BodyFields,
    framing: "body",
  },
  {
    id: "outfit",
    label: "Tenue",
    icon: Shirt,
    Fields: OutfitFields,
    framing: "body",
  },
  {
    id: "accessories",
    label: "Accessoires",
    icon: Glasses,
    Fields: AccessoryFields,
    framing: "bust",
  },
  {
    id: "animation",
    label: "Animation",
    icon: Play,
    Fields: AnimationFields,
    framing: "bust",
  },
] as const satisfies readonly (Category & {
  framing: Framing;
  Fields: typeof FaceFields;
})[];

function CreatorWorkbench({
  profile,
  onUse,
}: {
  profile: CreatorProfile;
  onUse: (id: string) => void;
}) {
  const patch = useCreatorPatch(profile);
  const preview = usePreview("face");
  const [category, setCategory] = useState<string>("face");
  const current =
    CREATOR_CATEGORIES.find((c) => c.id === category) ?? CREATOR_CATEGORIES[0];
  const Fields = current.Fields;
  return (
    <>
      <CategoryRail
        categories={[...CREATOR_CATEGORIES]}
        current={category}
        onOpen={(id) => {
          setCategory(id);
          const c = CREATOR_CATEGORIES.find((x) => x.id === id);
          if (c) preview.setFraming(c.framing);
        }}
      />
      <PreviewPanel preview={preview} label={`Aperçu 3D de ${profile.name}`}>
        <CreatorView
          profile={profile}
          getFrame={preview.getFrame}
          view={preview.view}
        />
      </PreviewPanel>
      <SidePanel
        profile={profile}
        title={current.label}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={() => patch(randomCreator())}
            >
              <Shuffle /> Au hasard
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onUse(profile.id)}
            >
              <Play /> Utiliser en live
            </Button>
          </>
        }
      >
        <Fields c={profile.creator} patch={patch} />
      </SidePanel>
    </>
  );
}

const PART_ICON: Record<PartGroup, LucideIcon> = {
  hair: Scissors,
  eyes: Eye,
  face: Smile,
  skin: Footprints,
  clothes: Shirt,
  accessory: Glasses,
  other: Sparkles,
};
const PART_FRAMING: Record<PartGroup, Framing> = {
  hair: "bust",
  eyes: "face",
  face: "face",
  skin: "body",
  clothes: "body",
  accessory: "bust",
  other: "body",
};

function VrmWorkbench({
  profile,
  onUse,
}: {
  profile: VrmProfile;
  onUse: (id: string) => void;
}) {
  const { custom, setCustom, setPart } = useVrmCustom(profile);
  const info = useVrmModelInfo();
  const parts = info.profileId === profile.id ? info.parts : [];
  const groups = GROUP_ORDER.filter((g) => parts.some((p) => p.group === g));
  const preview = usePreview("bust");
  const [category, setCategory] = useState<string>("general");
  const [error, setError] = useState<string | null>(null);
  const categories: Category[] = [
    { id: "general", label: "Général", icon: Settings2 },
    ...groups.map((g) => ({
      id: g,
      label: GROUP_LABEL[g],
      icon: PART_ICON[g],
    })),
  ];
  const group = groups.find((g) => g === category) ?? null;
  const items = group ? parts.filter((p) => p.group === group) : [];

  const reset = () =>
    setCustom(
      group
        ? {
            materials: Object.fromEntries(
              Object.entries(custom.materials).filter(
                ([k]) => !items.some((p) => p.key === k),
              ),
            ),
          }
        : {
            materials: {},
            headScale: 1,
            restExpression: "neutral",
            restWeight: 0.5,
          },
    );

  return (
    <>
      <CategoryRail
        categories={categories}
        current={group ?? "general"}
        onOpen={(id) => {
          setCategory(id);
          const g = GROUP_ORDER.find((x) => x === id);
          preview.setFraming(g ? PART_FRAMING[g] : "bust");
        }}
      />
      <PreviewPanel preview={preview} label={`Aperçu 3D de ${profile.name}`}>
        <VrmView
          profile={profile}
          mediaBase={mediaBase()}
          getFrame={preview.getFrame}
          onError={setError}
          view={preview.view}
        />
        {error ? (
          <p
            role="alert"
            className="absolute inset-x-4 bottom-4 rounded-md bg-destructive/15 px-3 py-2 text-xs text-destructive"
          >
            {error}
          </p>
        ) : null}
      </PreviewPanel>
      <SidePanel
        profile={profile}
        title={group ? GROUP_LABEL[group] : "Général"}
        actions={
          <>
            <Button
              size="sm"
              variant="outline"
              className="flex-1"
              onClick={reset}
            >
              <RotateCcw /> {group ? "Rétablir" : "Tout rétablir"}
            </Button>
            <Button
              size="sm"
              className="flex-1"
              onClick={() => onUse(profile.id)}
            >
              <Play /> Utiliser en live
            </Button>
          </>
        }
      >
        {group ? (
          <>
            <p className="text-xs leading-relaxed text-muted-foreground">
              La couleur recolore la texture en gardant ses ombres. L'étincelle
              ajoute un motif, l'œil masque la pièce.
            </p>
            <ul className="flex flex-col gap-1.5">
              {items.map((p) => (
                <PartRow
                  key={p.key}
                  part={p}
                  cfg={custom.materials[p.key] ?? EMPTY_PART}
                  onChange={(next) => setPart(p.key, next)}
                />
              ))}
            </ul>
          </>
        ) : (
          <>
            <VrmGeneralFields custom={custom} setCustom={setCustom} />
            {parts.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Les pièces du modèle (cheveux, yeux, vêtements...) apparaissent
                dans les catégories une fois l'avatar chargé.
              </p>
            ) : null}
          </>
        )}
      </SidePanel>
    </>
  );
}
