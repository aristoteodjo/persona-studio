import { RotateCcw } from "lucide-react";
import {
  type KeyboardEvent,
  type PointerEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppModal } from "@/components/shared/app-modal";
import { Button } from "@/components/ui/button";
import { mediaUrl } from "@/modules/avatar";
import {
  ANCHORS,
  type AnchorGroup,
  anchorsFrom,
  type Px,
  templateLandmarks,
  warpLandmarks,
} from "@/modules/avatar/puppet/manual";
import { mediaBase } from "@/modules/overlay-link";
import { FACE_LANDMARK_COUNT } from "@/modules/profiles/schema";
import { cn } from "@/lib/utils";

const GROUP_FILL: Record<AnchorGroup, string> = {
  face: "fill-sky-400",
  eyes: "fill-amber-300",
  brows: "fill-orange-400",
  nose: "fill-fuchsia-400",
  mouth: "fill-rose-500",
};

type Size = { width: number; height: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  image: string;
  landmarks: readonly number[];
  size: Size | null;
  onSave: (landmarks: number[], size: Size) => void;
};

export function FaceMarkerModal({ open, onOpenChange, ...rest }: Props) {
  return (
    <AppModal
      open={open}
      onOpenChange={onOpenChange}
      title="Placer les repères du visage"
      description="Glisse chaque point sur le visage du personnage. Les petits points montrent le maillage qui sera animé."
      size="xl"
    >
      {open ? <Editor {...rest} onClose={() => onOpenChange(false)} /> : null}
    </AppModal>
  );
}

type EditorProps = Omit<Props, "open" | "onOpenChange"> & {
  onClose: () => void;
};

function Editor({
  profileId,
  image,
  landmarks,
  size: knownSize,
  onSave,
  onClose,
}: EditorProps) {
  const [size, setSize] = useState<Size | null>(knownSize);
  const [anchors, setAnchors] = useState<Px[] | null>(null);
  const [selected, setSelected] = useState(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const dragging = useRef<number | null>(null);

  const source = useMemo(() => {
    if (!size) return null;
    return landmarks.length === FACE_LANDMARK_COUNT * 3
      ? landmarks
      : templateLandmarks(size.width, size.height);
  }, [landmarks, size]);

  const initial = useMemo(
    () =>
      source && size ? anchorsFrom(source, size.width, size.height) : null,
    [source, size],
  );
  const points = anchors ?? initial;

  const preview = useMemo(
    () =>
      source && size && points
        ? warpLandmarks(source, points, size.width, size.height)
        : null,
    [source, size, points],
  );

  const move = (k: number, p: Px) => {
    if (!size || !points) return;
    const next = [...points];
    next[k] = {
      x: Math.min(Math.max(p.x, 0), size.width),
      y: Math.min(Math.max(p.y, 0), size.height),
    };
    setAnchors(next);
  };

  const toImage = (e: PointerEvent): Px | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onPointerDown = (k: number) => (e: PointerEvent<SVGCircleElement>) => {
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    dragging.current = k;
    setSelected(k);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const k = dragging.current;
    if (k === null) return;
    const p = toImage(e);
    if (p) move(k, p);
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    dragging.current = null;
    if (svgRef.current?.hasPointerCapture(e.pointerId)) {
      svgRef.current.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (k: number) => (e: KeyboardEvent<SVGCircleElement>) => {
    const step = e.shiftKey ? 10 : 1;
    const d: Record<string, Px> = {
      ArrowLeft: { x: -step, y: 0 },
      ArrowRight: { x: step, y: 0 },
      ArrowUp: { x: 0, y: -step },
      ArrowDown: { x: 0, y: step },
    };
    const delta = d[e.key];
    const p = points?.[k];
    if (!delta || !p) return;
    e.preventDefault();
    move(k, { x: p.x + delta.x, y: p.y + delta.y });
  };

  const unit = size ? Math.max(size.width, size.height) / 140 : 1;
  const current = ANCHORS[selected];

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_15rem]">
      <div className="relative flex max-h-[68vh] items-center justify-center overflow-hidden rounded-lg bg-muted/40">
        <img
          src={mediaUrl(mediaBase(), profileId, image)}
          alt=""
          crossOrigin="anonymous"
          className={cn(
            "max-h-[68vh] w-auto max-w-full select-none",
            size ? "" : "opacity-0",
          )}
          draggable={false}
          onLoad={(e) => {
            if (size) return;
            const el = e.currentTarget;
            if (el.naturalWidth > 0 && el.naturalHeight > 0) {
              setSize({ width: el.naturalWidth, height: el.naturalHeight });
            }
          }}
        />
        {size && points ? (
          <svg
            ref={svgRef}
            viewBox={`0 0 ${size.width} ${size.height}`}
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 size-full touch-none"
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-label="Repères du visage"
          >
            {preview
              ? Array.from({ length: FACE_LANDMARK_COUNT }, (_, i) => (
                  <circle
                    // biome-ignore lint/suspicious/noArrayIndexKey: fixed landmark slots
                    key={i}
                    cx={(preview[i * 3] ?? 0) * size.width}
                    cy={(preview[i * 3 + 1] ?? 0) * size.height}
                    r={unit * 0.22}
                    className="pointer-events-none fill-white/70"
                  />
                ))
              : null}
            {points.map((p, k) => {
              const a = ANCHORS[k];
              if (!a) return null;
              return (
                // biome-ignore lint/a11y/useSemanticElements: draggable svg handle
                <circle
                  key={a.id}
                  cx={p.x}
                  cy={p.y}
                  r={unit * (k === selected ? 1.1 : 0.8)}
                  role="button"
                  tabIndex={0}
                  aria-label={a.label}
                  className={cn(
                    "cursor-grab stroke-black/70 outline-none active:cursor-grabbing",
                    GROUP_FILL[a.group],
                  )}
                  strokeWidth={unit * 0.2}
                  onPointerDown={onPointerDown(k)}
                  onFocus={() => setSelected(k)}
                  onKeyDown={onKeyDown(k)}
                />
              );
            })}
          </svg>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 text-sm">
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs text-muted-foreground">Point sélectionné</p>
          <p className="font-medium">{current?.label}</p>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            Gauche et droite suivent l'écran. Flèches pour ajuster au pixel, Maj
            + flèche pour aller plus vite.
          </p>
        </div>
        <ul className="flex max-h-[38vh] flex-col gap-0.5 overflow-y-auto text-xs">
          {ANCHORS.map((a, k) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => setSelected(k)}
                className={cn(
                  "flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-muted",
                  k === selected && "bg-muted font-medium",
                )}
              >
                <svg viewBox="0 0 10 10" className="size-2.5" aria-hidden>
                  <circle cx="5" cy="5" r="5" className={GROUP_FILL[a.group]} />
                </svg>
                {a.label}
              </button>
            </li>
          ))}
        </ul>
        {!preview && size ? (
          <p role="alert" className="text-xs text-destructive">
            Certains points se superposent : écarte-les pour continuer.
          </p>
        ) : null}
        <div className="mt-auto flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setAnchors(null)}
            disabled={anchors === null}
          >
            <RotateCcw /> Réinitialiser
          </Button>
          <div className="ml-auto flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Annuler
            </Button>
            <Button
              size="sm"
              disabled={!preview || !size}
              onClick={() => {
                if (!preview || !size) return;
                onSave(preview, size);
                onClose();
              }}
            >
              Enregistrer
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
