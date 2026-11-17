import { useEffect, useRef } from "react";
import {
  BoxGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DataTexture,
  DirectionalLight,
  type BufferGeometry,
  Group,
  HemisphereLight,
  type Material,
  Mesh,
  MeshBasicMaterial,
  MeshToonMaterial,
  NearestFilter,
  PerspectiveCamera,
  RedFormat,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
import { creatorPose } from "@/modules/avatar/creator/pose";
import {
  buildCreatorSpec,
  type GroupId,
  type Part,
} from "@/modules/avatar/creator/spec";
import { LIGHT_RIGS } from "@/modules/avatar/lighting";
import type { CreatorProfile } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

export type Framing = "face" | "bust" | "body";

/** Free camera used by the Atelier; read every frame, never through React. */
export type OrbitView = {
  yaw: number;
  zoom: number;
  framing: Framing;
  spin: boolean;
};

/** Height framed and point looked at, per framing. */
const FRAMINGS: Record<Framing, { height: number; y: number }> = {
  face: { height: 0.6, y: 1.43 },
  bust: { height: 0.95, y: 1.22 },
  body: { height: 1.85, y: 0.86 },
};

type Props = {
  profile: CreatorProfile;
  getFrame: () => RigFrame;
  view?: { current: OrbitView };
};

const FOV = 25;
const FRAME_HEIGHT = 0.95;

function geometry(p: Part): BufferGeometry {
  const d = (i: number) => p.dims[i] ?? 0.01;
  switch (p.shape) {
    case "sphere":
      return new SphereGeometry(d(0), 32, 20);
    case "capsule":
      return new CapsuleGeometry(d(0), d(1), 8, 20);
    case "box":
      return new BoxGeometry(d(0), d(1), d(2));
    case "cylinder":
      return new CylinderGeometry(d(0), d(1), d(2), 24);
    case "cone":
      return new ConeGeometry(d(0), d(1), 20);
    case "torus":
      return new TorusGeometry(d(0), d(1), 12, 40, d(2));
  }
}

/** Three tone steps: the cel-shaded look of the rest of the studio. */
function toonRamp() {
  const t = new DataTexture(new Uint8Array([90, 170, 255]), 3, 1, RedFormat);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.needsUpdate = true;
  return t;
}

type Built = {
  root: Group;
  groups: Record<GroupId, Group>;
  dispose: () => void;
};

function build(profile: CreatorProfile, ramp: DataTexture): Built {
  const spec = buildCreatorSpec(profile.creator);
  const root = new Group();
  const groups = {} as Record<GroupId, Group>;
  const order: GroupId[] = [
    "body",
    "head",
    "eyeL",
    "eyeR",
    "browL",
    "browR",
    "mouth",
  ];
  for (const id of order) {
    const g = new Group();
    const def = spec.groups[id];
    g.position.set(...def.origin);
    groups[id] = g;
    (def.parent ? groups[def.parent] : root).add(g);
  }
  groups.head.scale.setScalar(profile.creator.headScale);
  const geometries: BufferGeometry[] = [];
  const materials = new Map<string, Material>();
  for (const p of spec.parts) {
    const key = `${p.flat ? "b" : "t"}${p.color}`;
    let mat = materials.get(key);
    if (!mat) {
      mat = p.flat
        ? new MeshBasicMaterial({ color: p.color })
        : new MeshToonMaterial({ color: p.color, gradientMap: ramp });
      materials.set(key, mat);
    }
    const geo = geometry(p);
    geometries.push(geo);
    const mesh = new Mesh(geo, mat);
    mesh.position.set(...p.position);
    if (p.rotation) mesh.rotation.set(...p.rotation);
    if (p.scale) mesh.scale.set(...p.scale);
    groups[p.group].add(mesh);
  }
  return {
    root,
    groups,
    dispose: () => {
      for (const g of geometries) g.dispose();
      for (const m of materials.values()) m.dispose();
    },
  };
}

export default function CreatorView({ profile, getFrame, view }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let raf = 0;
    const renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setClearColor(0x000000, 0);
    const scene = new Scene();
    const camera = new PerspectiveCamera(FOV, 1, 0.05, 50);
    const key = new DirectionalLight();
    const fill = new DirectionalLight();
    const sky = new HemisphereLight();
    scene.add(key, fill, sky);
    const ramp = toonRamp();
    let litKey = "";
    const relight = () => {
      const s = profileRef.current.scene;
      const k = `${s.lighting}:${s.light}`;
      if (k === litKey) return;
      litKey = k;
      const rig = LIGHT_RIGS[s.lighting];
      for (const [light, cfg] of [
        [key, rig.key],
        [fill, rig.fill],
      ] as const) {
        light.color.setHex(cfg.color);
        light.intensity = Math.PI * cfg.intensity * s.light;
        light.position.set(...cfg.position);
      }
      sky.color.setHex(rig.sky);
      sky.groundColor.setHex(rig.ground);
      sky.intensity = rig.ambient * s.light;
    };

    let built: Built | null = null;
    let builtLook = "";
    let browBase = 0;
    let headBase = 0;
    const focus = new Vector3();
    const rebuild = () => {
      const look = JSON.stringify(profileRef.current.creator);
      if (built && look === builtLook) return built;
      if (built) {
        scene.remove(built.root);
        built.dispose();
      }
      builtLook = look;
      built = build(profileRef.current, ramp);
      scene.add(built.root);
      browBase = built.groups.browL.position.y;
      headBase = built.groups.head.position.y;
      focus.set(...buildCreatorSpec(profileRef.current.creator).focus);
      return built;
    };

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
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
      relight();
      const { groups } = rebuild();
      const { motion, creator } = profileRef.current;
      const orbit = view?.current;
      if (orbit) {
        const f = FRAMINGS[orbit.framing];
        const visible = f.height / orbit.zoom;
        const dist = visible / 2 / Math.tan((FOV * Math.PI) / 360);
        if (orbit.spin) orbit.yaw += 0.006;
        const y = orbit.framing === "face" ? focus.y : f.y;
        camera.position.set(
          Math.sin(orbit.yaw) * dist,
          y,
          Math.cos(orbit.yaw) * dist,
        );
        camera.lookAt(0, y, 0);
      } else {
        const visible = FRAME_HEIGHT / motion.scale;
        const dist = visible / 2 / Math.tan((FOV * Math.PI) / 360);
        const target = new Vector3(
          focus.x - motion.offsetX * visible * camera.aspect * 0.5,
          focus.y - 0.2 + motion.offsetY * visible * 0.5,
          focus.z,
        );
        camera.position.set(target.x, target.y, target.z + dist);
        camera.lookAt(target);
      }

      const pose = creatorPose(getFrame(), creator, motion, now);
      groups.head.rotation.set(...pose.head);
      groups.head.position.y = headBase + pose.breath * 0.5 + pose.bounce;
      groups.body.rotation.set(...pose.body);
      groups.body.scale.set(1, 1 + pose.breath * 0.3, 1);
      groups.eyeL.scale.y = pose.eyeL;
      groups.eyeR.scale.y = pose.eyeR;
      groups.mouth.scale.set(pose.mouth.x, pose.mouth.y, 1);
      groups.browL.position.y = browBase + pose.brow;
      groups.browR.position.y = browBase + pose.brow;
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      built?.dispose();
      ramp.dispose();
      renderer.dispose();
    };
  }, [getFrame, view]);

  return <canvas ref={canvasRef} className="absolute inset-0 size-full" />;
}
