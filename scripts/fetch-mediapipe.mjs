// Copies the MediaPipe WASM runtime and downloads the face model so tracking works offline.
import { createWriteStream, existsSync } from "node:fs";
import { cp, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const root = path.resolve(import.meta.dirname, "..");
const wasmSrc = path.join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const wasmDst = path.join(root, "public/mediapipe");
const modelDst = path.join(root, "public/models/face_landmarker.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

await mkdir(wasmDst, { recursive: true });
for (const file of ["vision_wasm_internal.js", "vision_wasm_internal.wasm"]) {
  await cp(path.join(wasmSrc, file), path.join(wasmDst, file));
}
console.log("mediapipe wasm copied");

if (existsSync(modelDst)) {
  console.log("face model already present");
} else {
  await mkdir(path.dirname(modelDst), { recursive: true });
  const res = await fetch(MODEL_URL);
  if (!res.ok || !res.body) throw new Error(`model download failed: ${res.status}`);
  const tmp = `${modelDst}.part`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await rename(tmp, modelDst);
  console.log("face model downloaded");
}
