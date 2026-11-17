import type { VRM, VRMHumanBoneName } from "@pixiv/three-vrm";
import { Euler, Quaternion } from "three";
import type { VrmConfig } from "@/modules/profiles/schema";
import {
  type ArmPose,
  armRotations,
  type Quat,
  quatForMetaVersion,
} from "@/modules/rig/gestures";

type Side = "left" | "right";

const FINGER_BONES: Record<Side, VRMHumanBoneName[][]> = {
  left: [
    ["leftThumbMetacarpal", "leftThumbProximal", "leftThumbDistal"],
    ["leftIndexProximal", "leftIndexIntermediate", "leftIndexDistal"],
    ["leftMiddleProximal", "leftMiddleIntermediate", "leftMiddleDistal"],
    ["leftRingProximal", "leftRingIntermediate", "leftRingDistal"],
    ["leftLittleProximal", "leftLittleIntermediate", "leftLittleDistal"],
  ],
  right: [
    ["rightThumbMetacarpal", "rightThumbProximal", "rightThumbDistal"],
    ["rightIndexProximal", "rightIndexIntermediate", "rightIndexDistal"],
    ["rightMiddleProximal", "rightMiddleIntermediate", "rightMiddleDistal"],
    ["rightRingProximal", "rightRingIntermediate", "rightRingDistal"],
    ["rightLittleProximal", "rightLittleIntermediate", "rightLittleDistal"],
  ],
};

/** Bend per joint (proximal, intermediate, distal) for a fully closed finger. */
const FINGER_BEND = [1.2, 1.5, 1.0];
const THUMB_BEND = [0.4, 0.6, 0.6];
/** Hands hang relaxed, slightly curled, when not tracked. */
const REST_CURL = 0.2;
const TAU = 0.08;

const tmpQ = new Quaternion();
const tmpE = new Euler();

/**
 * Drives arms and fingers toward the tracked gesture, or back to the rest pose
 * when the hands leave the camera. Slerping makes both transitions smooth.
 */
export function applyArms(
  vrm: VRM,
  arms: ArmPose | null,
  cfg: VrmConfig,
  dt: number,
) {
  const k = 1 - Math.exp(-dt / TAU);
  const version = vrm.meta.metaVersion === "0" ? "0" : "1";
  const toward = (bone: VRMHumanBoneName, q: Quat) => {
    const node = vrm.humanoid.getNormalizedBoneNode(bone);
    if (!node) return;
    const [x, y, z, w] = quatForMetaVersion(q, version);
    node.quaternion.slerp(tmpQ.set(x, y, z, w), k);
  };
  const euler = (x: number, y: number, z: number): Quat => {
    tmpQ.setFromEuler(tmpE.set(x, y, z));
    return [tmpQ.x, tmpQ.y, tmpQ.z, tmpQ.w];
  };

  for (const side of ["left", "right"] as const) {
    const tracked = cfg.gestures ? (arms?.[side] ?? null) : null;
    const sign = side === "left" ? -1 : 1;
    if (tracked) {
      const r = armRotations(tracked, side);
      toward(`${side}UpperArm`, r.upper);
      toward(`${side}LowerArm`, r.lower);
    } else {
      toward(`${side}UpperArm`, euler(0, 0, sign * cfg.arms));
      toward(`${side}LowerArm`, [0, 0, 0, 1]);
    }
    const curls = tracked?.curl ?? null;
    FINGER_BONES[side].forEach((bones, f) => {
      const c = curls?.[f] ?? REST_CURL;
      const bend = f === 0 ? THUMB_BEND : FINGER_BEND;
      bones.forEach((bone, j) => {
        toward(bone, euler(0, 0, sign * c * (bend[j] ?? 0)));
      });
    });
  }
}
