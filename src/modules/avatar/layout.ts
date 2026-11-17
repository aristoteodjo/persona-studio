import { overlayKey } from "@/modules/overlay-link/key";
import type { Motion } from "@/modules/profiles/schema";

/** Share of the stage height the avatar fills at scale 1, anchored bottom center. */
export const STAGE_FILL = 0.92;

export function mediaUrl(base: string, profileId: string, file: string) {
  return `${base}/media/${profileId}/${file}?key=${overlayKey()}`;
}

/** Fits an image in the stage (contain, bottom-centered) then applies the profile scale and offset. */
export function fitBox(
  stageW: number,
  stageH: number,
  imgW: number,
  imgH: number,
  motion: Motion,
) {
  const fit = Math.min(
    (stageW * STAGE_FILL) / imgW,
    (stageH * STAGE_FILL) / imgH,
  );
  const scale = fit * motion.scale;
  const w = imgW * scale;
  const h = imgH * scale;
  return {
    x: (stageW - w) / 2 + motion.offsetX * stageW * 0.5,
    y: stageH - h + motion.offsetY * stageH * 0.5,
    scale,
    width: w,
    height: h,
  };
}
