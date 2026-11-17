// Installs the Live2D Cubism Core (proprietary, downloaded by hand from live2d.com
// after accepting its license) so the app can render Live2D models. Never committed.
// Usage: pnpm setup:live2d <CubismSdkForWeb zip | SDK folder | live2dcubismcore.min.js>
import { existsSync, readdirSync, statSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

const CORE = "live2dcubismcore.min.js";
const root = path.resolve(import.meta.dirname, "..");
const dst = path.join(root, "public/static/live2d", CORE);
const src = process.argv[2];
if (!src || !existsSync(src)) {
  console.error(
    "Usage: pnpm setup:live2d <CubismSdkForWeb-*.zip | dossier du SDK | live2dcubismcore.min.js>",
  );
  process.exit(1);
}

function findInDir(dir, depth = 0) {
  if (depth > 4) return null;
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (name === CORE) return p;
    if (statSync(p).isDirectory()) {
      const hit = findInDir(p, depth + 1);
      if (hit) return hit;
    }
  }
  return null;
}

await mkdir(path.dirname(dst), { recursive: true });
if (src.endsWith(".zip")) {
  const files = unzipSync(new Uint8Array(await readFile(src)), {
    filter: (f) => f.name.endsWith(`Core/${CORE}`),
  });
  const entry = Object.values(files)[0];
  if (!entry) throw new Error(`${CORE} introuvable dans ${src}`);
  await writeFile(dst, entry);
} else {
  const file = statSync(src).isDirectory() ? findInDir(src) : src;
  if (!file || path.basename(file) !== CORE) {
    throw new Error(`${CORE} introuvable dans ${src}`);
  }
  await copyFile(file, dst);
}
console.log(`Cubism Core installé : ${path.relative(root, dst)}`);
