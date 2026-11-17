import type { Pattern, PatternType } from "@/modules/profiles/schema";

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function star(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? r : r * 0.45;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fill();
}

function heart(ctx: Ctx, cx: number, cy: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.7);
  ctx.bezierCurveTo(
    cx - r * 1.2,
    cy - r * 0.2,
    cx - r * 0.5,
    cy - r,
    cx,
    cy - r * 0.35,
  );
  ctx.bezierCurveTo(
    cx + r * 0.5,
    cy - r,
    cx + r * 1.2,
    cy - r * 0.2,
    cx,
    cy + r * 0.7,
  );
  ctx.fill();
}

/** One repeatable tile of the motif, drawn in `color` on transparency. */
function tile(type: PatternType, size: number, color: string): OffscreenCanvas {
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  const s = size;
  switch (type) {
    case "stripes":
      ctx.fillRect(0, 0, s / 2, s);
      break;
    case "dots":
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.22, 0, Math.PI * 2);
      ctx.fill();
      break;
    case "checks":
      ctx.fillRect(0, 0, s / 2, s / 2);
      ctx.fillRect(s / 2, s / 2, s / 2, s / 2);
      break;
    case "stars":
      star(ctx, s / 2, s / 2, s * 0.3);
      break;
    case "hearts":
      heart(ctx, s / 2, s / 2, s * 0.3);
      break;
    case "zigzag":
      ctx.lineWidth = s * 0.12;
      ctx.beginPath();
      ctx.moveTo(0, s * 0.65);
      ctx.lineTo(s / 4, s * 0.35);
      ctx.lineTo(s / 2, s * 0.65);
      ctx.lineTo((s * 3) / 4, s * 0.35);
      ctx.lineTo(s, s * 0.65);
      ctx.stroke();
      break;
  }
  return c;
}

/**
 * Paints the motif over the texture, only where the texture is already opaque,
 * so it follows the part's shape on the UV atlas.
 */
export function paintPattern(
  ctx: Ctx,
  width: number,
  height: number,
  p: Pattern,
) {
  const size = Math.max(
    8,
    Math.round((Math.min(width, height) / 16) * p.scale),
  );
  const fill = ctx.createPattern(tile(p.type, size, p.color), "repeat");
  if (!fill) return;
  ctx.save();
  ctx.globalCompositeOperation = "source-atop";
  ctx.globalAlpha = p.opacity;
  ctx.translate(width / 2, height / 2);
  ctx.rotate((p.angle * Math.PI) / 180);
  ctx.fillStyle = fill;
  const d = Math.hypot(width, height);
  ctx.fillRect(-d, -d, d * 2, d * 2);
  ctx.restore();
}

/** Small preview swatch for the editor. */
export function patternPreview(p: Pattern, size = 40): OffscreenCanvas {
  const c = new OffscreenCanvas(size, size);
  const ctx = c.getContext("2d");
  if (ctx) {
    ctx.fillStyle = "#8a8a8a";
    ctx.fillRect(0, 0, size, size);
    paintPattern(ctx, size * 4, size * 4, { ...p, scale: p.scale });
  }
  return c;
}
