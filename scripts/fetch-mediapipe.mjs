// Copies the MediaPipe WASM runtime and downloads the face model so tracking works offline.
import { createWriteStream, existsSync } from "node:fs";
import { cp, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = path.resolve(import.meta.dirname, "..");
const wasmSrc = path.join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = path.join(root, "public/mediapipe");
const MODELS = {
  "face_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  "pose_landmarker_lite.task":
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
  "hand_landmarker.task":
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
};

await mkdir(wasmDst, { recursive: true });
for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  await cp(path.join(wasmSrc, file), path.join(wasmDst, file));
}
console.log("mediapipe wasm copied");

for (const [name, url] of Object.entries(MODELS)) {
  const dst = path.join(root, "public/models", name);
  if (existsSync(dst)) {
    console.log(`${name} already present`);
    continue;
  }
  await mkdir(path.dirname(dst), { recursive: true });
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`${name} download failed: ${res.status}`);
  const tmp = `${dst}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await rename(tmp, dst);
  console.log(`${name} downloaded`);
}
