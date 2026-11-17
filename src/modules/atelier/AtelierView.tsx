import { useMutation } from "@tanstack/react-query";
import {
  Footprints,
  Glasses,
  Loader2,
  Palette,
  Play,
  Plus,
  RotateCw,
  Scissors,
  Shirt,
  Shuffle,
  Smile,
  Eye,
} from "lucide-react";
import {
  lazy,
  type PointerEvent,
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
import type { Framing, OrbitView } from "@/modules/avatar/creator/CreatorView";
import type { CreatorProfile, Profile } from "@/modules/profiles/schema";
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
import { getLiveFrame } from "@/modules/tracking";

const CreatorView = lazy(() => import("@/modules/avatar/creator/CreatorView"));

const CATEGORIES = [
  { id: "face", label: "Visage", icon: Smile, Fields: FaceFields },
  { id: "eyes", label: "Yeux", icon: Eye, Fields: EyesFields },
  { id: "hair", label: "Cheveux", icon: Scissors, Fields: HairFields },
  { id: "body", label: "Corps", icon: Footprints, Fields: BodyFields },
  { id: "outfit", label: "Tenue", icon: Shirt, Fields: OutfitFields },
  {
    id: "accessories",
    label: "Accessoires",
    icon: Glasses,
    Fields: AccessoryFields,
  },
  { id: "animation", label: "Animation", icon: Play, Fields: AnimationFields },
] as const;

type CategoryId = (typeof CATEGORIES)[number]["id"];

/** Framing that suits each category, applied when the category is opened. */
const CATEGORY_FRAMING: Record<CategoryId, Framing> = {
  face: "face",
  eyes: "face",
  hair: "bust",
  body: "body",
  outfit: "body",
  accessories: "bust",
  animation: "bust",
};

const FRAMING_LABEL: Record<Framing, string> = {
  face: "Visage",
  bust: "Buste",
  body: "Corps entier",
};

type Props = {
  profiles: Profile[];
  initialId: string | null;
  onUse: (id: string) => void;
};

/** The in-app avatar workshop: a large orbitable preview and VRoid-like categories. */
export function AtelierView({ profiles, initialId, onUse }: Props) {
  const creations = profiles.filter(
    (p): p is CreatorProfile => p.kind === "creator",
  );
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const selected =
    creations.find((p) => p.id === selectedId) ?? creations[0] ?? null;

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

  return (
    <div className="flex min-h-0 flex-1">
      <aside className="flex w-56 shrink-0 flex-col border-r border-border/70">
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
            {create.isPending ? <Loader2 className="animate-spin" /> : <Plus />}
            Nouvelle
          </Button>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <ul className="flex flex-col gap-1 px-2 pb-3">
            {creations.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(p.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
                    selected?.id === p.id && "bg-muted font-medium",
                  )}
                >
                  <span
                    aria-hidden
                    className="size-6 shrink-0 rounded-full border border-black/20"
                    style={{
                      background: `linear-gradient(135deg, ${p.creator.hair.color} 50%, ${p.creator.outfit.color} 50%)`,
                    }}
                  />
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            ))}
          </ul>
          {creations.length === 0 ? (
            <p className="px-4 text-xs leading-relaxed text-muted-foreground">
              Aucune création pour l'instant. Commence par « Nouvelle ».
            </p>
          ) : null}
        </ScrollArea>
      </aside>

      {selected ? (
        <Workbench key={selected.id} profile={selected} onUse={onUse} />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <Palette className="size-8 text-primary" aria-hidden />
          <p className="max-w-sm text-sm text-muted-foreground">
            Crée ton propre avatar 3D pièce par pièce : visage, yeux, coiffure,
            corps, tenue et accessoires. Il s'anime ensuite avec ta caméra.
          </p>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus /> Nouvelle création
          </Button>
        </div>
      )}
    </div>
  );
}

function Workbench({
  profile,
  onUse,
}: {
  profile: CreatorProfile;
  onUse: (id: string) => void;
}) {
  const patch = useCreatorPatch(profile);
  const rename = useProfiles((s) => s.update);
  const [category, setCategory] = useState<CategoryId>("face");
  const [framing, setFraming] = useState<Framing>("face");
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
  const drag = useRef<{ x: number; yaw: number } | null>(null);

  const open = (id: CategoryId) => {
    setCategory(id);
    setFraming(CATEGORY_FRAMING[id]);
    view.current.zoom = 1;
  };

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

  const current = CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0];
  const Fields = current.Fields;

  return (
    <>
      <nav
        aria-label="Catégories"
        className="flex w-20 shrink-0 flex-col items-center gap-1 border-r border-border/70 py-3"
      >
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            aria-pressed={c.id === category}
            onClick={() => open(c.id)}
            className={cn(
              "flex w-16 flex-col items-center gap-1 rounded-lg py-2 text-[11px] outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring",
              c.id === category
                ? "bg-primary/15 text-foreground"
                : "text-muted-foreground",
            )}
          >
            <c.icon className="size-4" aria-hidden />
            {c.label}
          </button>
        ))}
      </nav>

      <section className="relative flex min-w-0 flex-1 flex-col">
        <div
          className="relative min-h-0 flex-1 cursor-grab touch-none bg-[radial-gradient(ellipse_at_center,var(--muted)_0%,transparent_70%)] active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onWheel={onWheel}
          role="img"
          aria-label={`Aperçu 3D de ${profile.name}`}
        >
          <Suspense
            fallback={
              <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
                Chargement de l'aperçu…
              </div>
            }
          >
            <CreatorView profile={profile} getFrame={getFrame} view={view} />
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
                onClick={() => {
                  setFraming(f);
                  view.current.zoom = 1;
                }}
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
            onClick={() => setSpin((v) => !v)}
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

      <aside className="flex w-80 shrink-0 flex-col border-l border-border/70">
        <div className="flex flex-col gap-3 border-b border-border/70 p-4">
          <input
            aria-label="Nom de la création"
            value={profile.name}
            maxLength={60}
            onChange={(e) => {
              const name = e.target.value;
              if (name.trim()) rename(profile.id, (p) => ({ ...p, name }));
            }}
            className="w-full rounded-md border border-border bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          <div className="flex gap-2">
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
          </div>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            <h3 className="text-sm font-semibold">{current.label}</h3>
            <Fields c={profile.creator} patch={patch} />
          </div>
        </ScrollArea>
      </aside>
    </>
  );
}
