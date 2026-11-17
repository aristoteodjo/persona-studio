import { CanvasTexture, type Material, type Texture } from "three";
import { paintPattern } from "@/modules/avatar/vrm/patterns";
import {
  averageHsl,
  type Hsl,
  hexToHsl,
  recolor,
} from "@/modules/avatar/vrm/recolor";
import type { VrmCustom } from "@/modules/profiles/schema";

type Slot = "map" | "shadeMultiplyTexture";
/** MToon draws lit areas from `map` and shaded ones from `shadeMultiplyTexture`: both are edited. */
const SLOTS: Slot[] = ["map", "shadeMultiplyTexture"];

type Mapped = Material &
  Partial<Record<Slot, Texture | null>> & { needsUpdate: boolean };

type Source = { width: number; height: number; pixels: ImageData; avg: Hsl };

/** Keeps each material's original textures so edits are always recomputed from them. */
export class TextureEditor {
  private originals = new Map<Mapped, Partial<Record<Slot, Texture>>>();
  private sources = new Map<Texture, Source>();
  private generated = new Map<string, CanvasTexture>();
  private ids = new Map<Mapped, number>();
  private token = 0;

  constructor(private parts: Map<string, Material[]>) {}

  private source(tex: Texture): Source | null {
    const hit = this.sources.get(tex);
    if (hit) return hit;
    const img = tex.image as
      | (CanvasImageSource & { width: number; height: number })
      | undefined;
    if (!img?.width || !img.height) return null;
    const canvas = new OffscreenCanvas(img.width, img.height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const pixels = ctx.getImageData(0, 0, img.width, img.height);
    const src = {
      width: img.width,
      height: img.height,
      pixels,
      avg: averageHsl(pixels.data),
    };
    this.sources.set(tex, src);
    return src;
  }

  private originalsOf(m: Mapped) {
    let o = this.originals.get(m);
    if (!o) {
      o = {};
      for (const slot of SLOTS) {
        const t = m[slot];
        if (t) o[slot] = t;
      }
      this.originals.set(m, o);
      this.ids.set(m, this.ids.size);
    }
    return o;
  }

  private restore(m: Mapped, slot: Slot, original: Texture) {
    if (m[slot] !== original) {
      m[slot] = original;
      m.needsUpdate = true;
    }
  }

  /** Recolors and patterns every part; stale runs are dropped when edits come fast. */
  async apply(custom: VrmCustom) {
    const token = ++this.token;
    for (const [key, materials] of this.parts) {
      const cfg = custom.materials[key];
      for (const m of materials as Mapped[]) {
        // Yield between parts so slider drags never freeze the render loop.
        await new Promise((r) => setTimeout(r, 0));
        if (token !== this.token) return;
        const originals = this.originalsOf(m);
        const lit = originals.map ? this.source(originals.map) : null;
        for (const slot of SLOTS) {
          const original = originals[slot];
          if (!original) continue;
          if (!cfg?.color && !cfg?.pattern) {
            this.restore(m, slot, original);
            continue;
          }
          const src = this.source(original);
          if (!src) continue;
          const data = new Uint8ClampedArray(src.pixels.data);
          // The shade texture moves with the lit one so the light/shadow contrast survives.
          if (cfg.color) recolor(data, hexToHsl(cfg.color), (lit ?? src).avg);
          const canvas = new OffscreenCanvas(src.width, src.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          ctx.putImageData(new ImageData(data, src.width, src.height), 0, 0);
          if (cfg.pattern) {
            paintPattern(ctx, src.width, src.height, cfg.pattern);
          }
          const id = `${this.ids.get(m)}:${slot}`;
          let tex = this.generated.get(id);
          if (!tex) {
            tex = new CanvasTexture(canvas as unknown as HTMLCanvasElement);
            tex.flipY = original.flipY;
            tex.colorSpace = original.colorSpace;
            tex.wrapS = original.wrapS;
            tex.wrapT = original.wrapT;
            tex.channel = original.channel;
            this.generated.set(id, tex);
          } else {
            tex.image = canvas as unknown as HTMLCanvasElement;
          }
          tex.needsUpdate = true;
          if (m[slot] !== tex) {
            m[slot] = tex;
            m.needsUpdate = true;
          }
        }
      }
    }
  }

  dispose() {
    this.token++;
    for (const t of this.generated.values()) t.dispose();
    this.generated.clear();
  }
}
