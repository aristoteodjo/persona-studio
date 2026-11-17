import {
  type VRM,
  type VRMHumanBoneName,
  VRMLoaderPlugin,
  VRMUtils,
} from "@pixiv/three-vrm";
import { useEffect, useRef, useState } from "react";
import {
  DirectionalLight,
  HemisphereLight,
  LoadingManager,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mediaUrl } from "@/modules/avatar/layout";
import { forMetaVersion, vrmPose } from "@/modules/avatar/vrm/pose";
import type { VrmProfile } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

type Props = {
  profile: VrmProfile;
  mediaBase: string;
  getFrame: () => RigFrame;
  onError?: (message: string) => void;
};

const BONES = [
  "neck",
  "head",
  "spine",
  "chest",
  "leftUpperArm",
  "rightUpperArm",
] as const satisfies readonly VRMHumanBoneName[];

const FOV = 25;
/** World height (meters) framed at scale 1: head, shoulders and chest. */
const FRAME_HEIGHT = 0.95;

type Status = "loading" | "ready" | "error";

export default function VrmView({
  profile,
  mediaBase,
  getFrame,
  onError,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("loading");
  const settingsRef = useRef({ motion: profile.motion, vrm: profile.vrm });
  settingsRef.current = { motion: profile.motion, vrm: profile.vrm };
  const url = profile.vrm.model
    ? mediaUrl(mediaBase, profile.id, profile.vrm.model)
    : null;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !url) return;
    let disposed = false;
    let raf = 0;
    let vrm: VRM | null = null;
    setStatus("loading");

    const renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setClearColor(0x000000, 0);
    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 0.05, 50);
    const key = new DirectionalLight(0xffffff, Math.PI * 0.55);
    key.position.set(0.6, 1.2, 1.5);
    scene.add(key, new HemisphereLight(0xffffff, 0x404050, 0.35));

    // A model may reference external URIs; loading them would leak that the overlay is live.
    const manager = new LoadingManager();
    manager.setURLModifier((u) =>
      u === url || u.startsWith("data:") || u.startsWith("blob:") ? u : "data:,",
    );
    const loader = new GLTFLoader(manager);
    loader.setCrossOrigin("anonymous");
    loader.register((parser) => new VRMLoaderPlugin(parser));

    const headPos = new Vector3(0, 1.4, 0);
    loader
      .loadAsync(url)
      .then((gltf) => {
        const loaded = gltf.userData.vrm as VRM | undefined;
        if (disposed) {
          if (loaded) VRMUtils.deepDispose(loaded.scene);
          return;
        }
        if (!loaded) throw new Error("Ce fichier n'est pas un modèle VRM.");
        VRMUtils.removeUnnecessaryVertices(gltf.scene);
        VRMUtils.combineSkeletons(gltf.scene);
        VRMUtils.rotateVRM0(loaded);
        loaded.scene.traverse((o) => {
          o.frustumCulled = false;
        });
        scene.add(loaded.scene);
        loaded.update(0);
        loaded.humanoid
          .getNormalizedBoneNode("head")
          ?.getWorldPosition(headPos);
        vrm = loaded;
        setStatus("ready");
      })
      .catch((e: unknown) => {
        if (disposed) return;
        setStatus("error");
        onError?.(e instanceof Error ? e.message : "Modèle illisible");
      });

    let last = performance.now();
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (w === 0 || h === 0) return;
      if (
        canvas.width !== Math.round(w * dpr) ||
        canvas.height !== Math.round(h * dpr)
      ) {
        renderer.setPixelRatio(dpr);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      }
      const { motion, vrm: cfg } = settingsRef.current;
      const visible = FRAME_HEIGHT / motion.scale;
      const dist = visible / 2 / Math.tan((FOV * Math.PI) / 360);
      const target = new Vector3(
        headPos.x - motion.offsetX * visible * camera.aspect * 0.5,
        headPos.y - 0.2 + motion.offsetY * visible * 0.5,
        headPos.z,
      );
      camera.position.set(target.x, target.y, target.z + dist);
      camera.lookAt(target);

      if (vrm) {
        const pose = vrmPose(getFrame(), cfg, motion, now);
        const version = vrm.meta.metaVersion === "0" ? "0" : "1";
        for (const bone of BONES) {
          const node = vrm.humanoid.getNormalizedBoneNode(bone);
          if (!node) continue;
          const r = forMetaVersion(pose[bone], version);
          node.rotation.set(r.x, r.y, r.z);
        }
        const em = vrm.expressionManager;
        if (em) {
          for (const [name, weight] of Object.entries(pose.expressions)) {
            if (em.getExpression(name)) em.setValue(name, weight);
          }
        }
        vrm.update(dt);
      }
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      if (vrm) {
        scene.remove(vrm.scene);
        VRMUtils.deepDispose(vrm.scene);
      }
      renderer.dispose();
    };
  }, [url, getFrame, onError]);

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 size-full" />
      {url && status === "loading" ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-white/70">
          Chargement du modèle 3D…
        </div>
      ) : null}
    </>
  );
}
