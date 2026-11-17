import { strFromU8, unzipSync } from "fflate";
import { Application } from "pixi.js";
import { useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/modules/avatar/layout";
import { live2dParams } from "@/modules/avatar/live2d/params";
import type { Live2dProfile } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

type Props = {
  profile: Live2dProfile;
  mediaBase: string;
  getFrame: () => RigFrame;
  onError?: (message: string) => void;
};

/** Proprietary runtime, installed locally by `pnpm setup:live2d` (never committed). */
const CORE_URL = "/static/live2d/live2dcubismcore.min.js";
const MODEL_ENTRY = "model.model3.json";
const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  json: "application/json",
};

let corePromise: Promise<void> | null = null;
function loadCore(): Promise<void> {
  if ("Live2DCubismCore" in window) return Promise.resolve();
  corePromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = CORE_URL;
    s.onload = () => resolve();
    s.onerror = () => {
      corePromise = null;
      reject(
        new Error(
          "Moteur Live2D introuvable : installe le Cubism Core (pnpm setup:live2d).",
        ),
      );
    };
    document.head.append(s);
  });
  return corePromise;
}

type Settings = {
  url?: string;
  FileReferences?: {
    Moc?: string;
    Textures?: string[];
    Physics?: string;
    Pose?: string;
    DisplayInfo?: string;
    UserData?: string;
    Expressions?: { Name?: string; File?: string }[];
    Motions?: Record<string, { File?: string }[]>;
  };
};

/** Unpacks the imported zip and points every file reference at an in-memory blob. */
async function unpack(
  url: string,
): Promise<{ settings: Settings; blobs: string[] }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Modèle Live2D introuvable (${res.status})`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const raw = files[MODEL_ENTRY];
  if (!raw) throw new Error("Ce fichier n'est pas un modèle Live2D.");
  const settings = JSON.parse(strFromU8(raw)) as Settings;
  const refs = settings.FileReferences;
  if (!refs?.Moc || !refs.Textures?.length) {
    throw new Error("Modèle Live2D incomplet.");
  }
  const blobs: string[] = [];
  const blobFor = (name: string) => {
    const bytes = files[name];
    if (!bytes) throw new Error(`Fichier manquant dans le modèle : ${name}`);
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    const u = URL.createObjectURL(
      new Blob([bytes as BlobPart], {
        type: MIME[ext] ?? "application/octet-stream",
      }),
    );
    blobs.push(u);
    return u;
  };
  const opt = (name?: string) => (name ? blobFor(name) : undefined);
  refs.Moc = blobFor(refs.Moc);
  refs.Textures = refs.Textures.map(blobFor);
  refs.Physics = opt(refs.Physics);
  refs.Pose = opt(refs.Pose);
  refs.DisplayInfo = opt(refs.DisplayInfo);
  refs.UserData = opt(refs.UserData);
  for (const e of refs.Expressions ?? []) e.File = opt(e.File);
  for (const list of Object.values(refs.Motions ?? {})) {
    for (const m of list) m.File = opt(m.File);
  }
  settings.url = MODEL_ENTRY;
  return { settings, blobs };
}

type Status = "loading" | "ready" | "error";

export default function Live2DView({
  profile,
  mediaBase,
  getFrame,
  onError,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const settingsRef = useRef({ motion: profile.motion, cfg: profile.live2d });
  settingsRef.current = { motion: profile.motion, cfg: profile.live2d };
  const url = profile.live2d.model
    ? mediaUrl(mediaBase, profile.id, profile.live2d.model)
    : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    let disposed = false;
    let raf = 0;
    let blobs: string[] = [];
    setStatus("loading");
    const app = new Application({
      view: canvas,
      backgroundAlpha: 0,
      antialias: true,
      autoStart: false,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
      width: canvas.clientWidth || 1,
      height: canvas.clientHeight || 1,
    });
    type Model = Awaited<
      ReturnType<
        typeof import("pixi-live2d-display-lipsyncpatch/cubism4")["Live2DModel"]["from"]
      >
    >;
    let model: Model | null = null;

    (async () => {
      await loadCore();
      // The plugin checks for the core when it is evaluated, so it must load after it.
      const { Live2DModel, MotionPreloadStrategy } = await import(
        "pixi-live2d-display-lipsyncpatch/cubism4"
      );
      const unpacked = await unpack(url);
      blobs = unpacked.blobs;
      if (disposed) return;
      const loaded = await Live2DModel.from(unpacked.settings, {
        autoUpdate: false,
        autoHitTest: false,
        autoFocus: false,
        motionPreload: MotionPreloadStrategy.IDLE,
      });
      if (disposed) {
        loaded.destroy();
        return;
      }
      const internal = loaded.internalModel;
      let params: Record<string, number> = {};
      const events = internal as unknown as {
        on: (event: string, fn: () => void) => void;
      };
      events.on("afterMotionUpdate", () => {
        const core = internal.coreModel as unknown as {
          setParameterValueById: (id: string, v: number) => void;
        };
        for (const [id, v] of Object.entries(params)) {
          core.setParameterValueById(id, v);
        }
      });
      // Tracking drives the eyes; the model's own random blink would fight it.
      (internal as { eyeBlink?: unknown }).eyeBlink = undefined;
      app.stage.addChild(loaded);
      model = loaded;
      setStatus("ready");

      const manager = internal.motionManager;
      const idleGroup = manager.groups.idle;
      let idleOn = true;
      let last = performance.now();
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(now - last, 100);
        last = now;
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        if (w === 0 || h === 0 || !model) return;
        if (app.screen.width !== w || app.screen.height !== h) {
          app.renderer.resize(w, h);
        }
        const { motion, cfg } = settingsRef.current;
        const mw = internal.width;
        const mh = internal.height;
        const fit = Math.min(w / mw, h / mh) * motion.scale;
        model.scale.set(fit);
        model.position.set(
          (w - mw * fit) / 2 + motion.offsetX * w * 0.5,
          (h - mh * fit) / 2 - motion.offsetY * h * 0.5,
        );
        if (cfg.idleMotion !== idleOn) {
          idleOn = cfg.idleMotion;
          // The manager restarts the idle group by itself; pointing it nowhere stops it.
          manager.groups.idle = idleOn ? idleGroup : "";
          if (!idleOn) manager.stopAllMotions();
        }
        params = live2dParams(getFrame(), cfg, motion, now);
        model.update(dt);
        app.renderer.render(app.stage);
      };
      raf = requestAnimationFrame(tick);
    })().catch((e: unknown) => {
      if (disposed) return;
      setStatus("error");
      onError?.(e instanceof Error ? e.message : "Modèle Live2D illisible");
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      model?.destroy({ children: true });
      app.destroy(false, { children: true });
      for (const b of blobs) URL.revokeObjectURL(b);
    };
  }, [url, getFrame, onError]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      {url && status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/70">
          Chargement du modèle Live2D…
        </div>
      ) : null}
    </>
  );
}
