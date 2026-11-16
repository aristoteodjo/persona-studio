import type {
  FaceLandmarker,
  FaceLandmarkerOptions,
} from "@mediapipe/tasks-vision";
import { FACE_LANDMARK_COUNT } from "@/modules/profiles/schema";

const WASM_BASE = "/mediapipe";
const MODEL = "/models/face_landmarker.task";

type Mode = "VIDEO" | "IMAGE";
const cache = new Map<Mode, Promise<FaceLandmarker>>();

/** Lazily loads MediaPipe: nothing is downloaded or compiled until tracking is used. */
export function faceLandmarker(mode: Mode): Promise<FaceLandmarker> {
  const hit = cache.get(mode);
  if (hit) return hit;
  const created = (async () => {
    const { FaceLandmarker, FilesetResolver } = await import(
      "@mediapipe/tasks-vision"
    );
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    const options = (delegate: "GPU" | "CPU"): FaceLandmarkerOptions => ({
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: mode,
      numFaces: 1,
      outputFaceBlendshapes: mode === "VIDEO",
      minFaceDetectionConfidence: mode === "IMAGE" ? 0.2 : 0.5,
      minFacePresenceConfidence: mode === "IMAGE" ? 0.2 : 0.5,
      minTrackingConfidence: 0.5,
    });
    try {
      return await FaceLandmarker.createFromOptions(fileset, options("GPU"));
    } catch {
      return await FaceLandmarker.createFromOptions(fileset, options("CPU"));
    }
  })();
  created.catch(() => cache.delete(mode));
  cache.set(mode, created);
  return created;
}

export type ImageFace = {
  landmarks: number[];
  width: number;
  height: number;
};

/** Finds the face on an imported picture so the puppet knows where eyes and mouth are. */
export async function detectFaceOnImage(
  src: string,
): Promise<ImageFace | null> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.crossOrigin = "anonymous";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image illisible"));
    el.src = src;
  });
  const detector = await faceLandmarker("IMAGE");
  const result = detector.detect(img);
  const face = result.faceLandmarks[0];
  if (!face || face.length < FACE_LANDMARK_COUNT) return null;
  const landmarks: number[] = [];
  for (let i = 0; i < FACE_LANDMARK_COUNT; i++) {
    const p = face[i];
    if (!p) return null;
    landmarks.push(
      Math.round(p.x * 1e5) / 1e5,
      Math.round(p.y * 1e5) / 1e5,
      Math.round(p.z * 1e5) / 1e5,
    );
  }
  return { landmarks, width: img.naturalWidth, height: img.naturalHeight };
}
