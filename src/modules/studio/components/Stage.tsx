import {
  Camera,
  CameraOff,
  Crosshair,
  Mic,
  MicOff,
  ScanFace,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { AvatarStage } from "@/modules/avatar";
import { mediaBase, useOverlayInfo } from "@/modules/overlay-link";
import type { Profile } from "@/modules/profiles/schema";
import { useSettings } from "@/modules/settings/store";
import {
  engine,
  getLiveFrame,
  setExpression,
  useTracking,
} from "@/modules/tracking";

const reportRenderError = (message: string) =>
  toast.error("Affichage de l'avatar impossible", { description: message });

function LevelMeter() {
  const level = useTracking((s) => s.level);
  const threshold = useSettings((s) => s.settings.micThreshold);
  const loud = level >= threshold;
  return (
    <div
      className="relative h-1.5 w-24 overflow-hidden rounded-full bg-muted"
      title={`Niveau du micro : ${Math.round(level * 100)} %`}
      aria-hidden
    >
      <div
        className={cn(
          "h-full transition-[width] duration-75",
          loud ? "bg-live" : "bg-muted-foreground/60",
        )}
        style={{ width: `${level * 100}%` }}
      />
      <div
        className="absolute inset-y-0 w-0.5 bg-primary"
        style={{ left: `${threshold * 100}%` }}
        aria-hidden
      />
    </div>
  );
}

function DeviceToggle({
  on,
  status,
  error,
  onToggle,
  iconOn: IconOn,
  iconOff: IconOff,
  label,
}: {
  on: boolean;
  status: string;
  error: string | null;
  onToggle: () => void;
  iconOn: typeof Camera;
  iconOff: typeof Camera;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            size="icon"
            variant={on ? "secondary" : "ghost"}
            onClick={onToggle}
            aria-pressed={on}
            aria-label={label}
            className={cn(status === "error" && "text-destructive")}
          />
        }
      >
        {on ? <IconOn /> : <IconOff />}
      </TooltipTrigger>
      <TooltipContent>
        {error ?? (status === "starting" ? "Démarrage…" : label)}
      </TooltipContent>
    </Tooltip>
  );
}

export function Stage({ profile }: { profile: Profile | null }) {
  const overlay = useOverlayInfo();
  const base = overlay.port ? mediaBase() : "";
  const { settings, set } = useSettings();
  const t = useTracking();
  const expressions = profile?.kind === "pngtuber" ? profile.expressions : [];
  const activeExpr =
    expressions.find((e) => e.id === t.expressionId)?.id ?? expressions[0]?.id;

  return (
    <section aria-label="Aperçu" className="flex min-w-0 flex-1 flex-col">
      <div className="relative m-3 mb-0 flex-1 overflow-hidden rounded-xl ring-1 ring-border checker">
        {profile && base ? (
          <AvatarStage
            profile={profile}
            mediaBase={base}
            getFrame={getLiveFrame}
            onError={reportRenderError}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
            {profile
              ? "Démarrage du serveur local…"
              : "Crée ou choisis un persona pour commencer."}
          </div>
        )}

        <div className="pointer-events-none absolute top-3 left-3 flex gap-2">
          <span className="flex items-center gap-1.5 rounded-full bg-background/80 px-2.5 py-1 text-xs backdrop-blur">
            <ScanFace
              className={cn(
                "size-3.5",
                t.face ? "text-live" : "text-muted-foreground",
              )}
              aria-hidden
            />
            {t.camera === "on"
              ? t.face
                ? "Visage suivi"
                : "Visage non détecté"
              : t.camera === "error"
                ? "Caméra indisponible"
                : t.camera === "starting"
                  ? "Démarrage de la caméra…"
                  : "Caméra coupée"}
          </span>
        </div>

        {t.cameraError || t.micError ? (
          <p
            role="alert"
            className="absolute right-3 bottom-3 left-3 rounded-lg bg-destructive/15 px-3 py-2 text-xs text-destructive"
          >
            {t.cameraError ? `Caméra : ${t.cameraError}` : null}
            {t.cameraError && t.micError ? " · " : null}
            {t.micError ? `Micro : ${t.micError}` : null}
          </p>
        ) : null}
      </div>

      <div className="flex h-16 shrink-0 items-center gap-2 px-3">
        <DeviceToggle
          on={settings.cameraEnabled}
          status={t.camera}
          error={t.cameraError}
          onToggle={() => set({ cameraEnabled: !settings.cameraEnabled })}
          iconOn={Camera}
          iconOff={CameraOff}
          label={
            settings.cameraEnabled ? "Couper la caméra" : "Activer la caméra"
          }
        />
        <DeviceToggle
          on={settings.micEnabled}
          status={t.mic}
          error={t.micError}
          onToggle={() => set({ micEnabled: !settings.micEnabled })}
          iconOn={Mic}
          iconOff={MicOff}
          label={settings.micEnabled ? "Couper le micro" : "Activer le micro"}
        />
        <LevelMeter />
        <Button
          size="sm"
          variant="ghost"
          onClick={() => engine.calibrate()}
          disabled={!t.face}
          className="ml-1"
        >
          <Crosshair /> Recentrer
        </Button>

        <div className="ml-auto flex min-w-0 items-center gap-1 overflow-x-auto">
          {expressions.map((e) => (
            <Button
              key={e.id}
              size="sm"
              variant={e.id === activeExpr ? "default" : "secondary"}
              onClick={() => setExpression(e.id)}
              aria-pressed={e.id === activeExpr}
            >
              {e.hotkey ? (
                <kbd className="rounded bg-background/30 px-1 font-mono text-[10px]">
                  {e.hotkey}
                </kbd>
              ) : null}
              {e.name}
            </Button>
          ))}
        </div>
        <span className="w-14 shrink-0 text-right font-mono text-[11px] text-muted-foreground tabular-nums">
          {t.fps} fps
        </span>
      </div>
    </section>
  );
}
