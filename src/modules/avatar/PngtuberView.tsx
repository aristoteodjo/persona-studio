import { useEffect, useRef } from "react";
import { mediaUrl, STAGE_FILL } from "@/modules/avatar/layout";
import {
  nextTalkEnergy,
  pickSlot,
  pngtuberTransform,
  resolveExpression,
} from "@/modules/avatar/pngtuber";
import {
  EXPRESSION_SLOTS,
  type PngtuberProfile,
} from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

type Props = {
  profile: PngtuberProfile;
  mediaBase: string;
  getFrame: () => RigFrame;
};

export function PngtuberView({ profile, mediaBase, getFrame }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef(profile);
  profileRef.current = profile;

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let energy = 0;
    let shown: HTMLElement | null = null;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const p = profileRef.current;
      const root = rootRef.current;
      const body = bodyRef.current;
      if (!root || !body) return;
      const frame = getFrame();
      const dt = now - last;
      last = now;
      energy = nextTalkEnergy(energy, frame.talking, dt);

      const expr = resolveExpression(p.expressions, frame.expressionId);
      const blinking = Math.max(frame.blinkL, frame.blinkR) > 0.5;
      const slot = expr ? pickSlot(expr, frame.talking, blinking) : null;
      const key = expr && slot ? `${expr.id}:${slot}` : "";
      const next = key
        ? root.querySelector<HTMLElement>(`[data-key="${key}"]`)
        : null;
      if (next !== shown) {
        if (shown) shown.style.visibility = "hidden";
        if (next) next.style.visibility = "visible";
        shown = next;
      }

      const t = pngtuberTransform(frame, p.motion, energy, now);
      const h = root.clientHeight * STAGE_FILL;
      body.style.transform = `translate(${t.x * h}px, ${t.y * h}px) rotate(${t.rotate}rad) scale(${t.scaleX}, ${t.scaleY})`;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [getFrame]);

  return (
    <div ref={rootRef} className="absolute inset-0 overflow-hidden">
      <div
        ref={bodyRef}
        className="absolute inset-x-0 bottom-0 will-change-transform"
        style={{ height: `${STAGE_FILL * 100}%`, transformOrigin: "50% 100%" }}
      >
        {profile.expressions.flatMap((e) =>
          EXPRESSION_SLOTS.map((slot) => {
            const file = e[slot];
            if (!file) return null;
            return (
              <img
                key={`${e.id}:${slot}:${file}`}
                data-key={`${e.id}:${slot}`}
                src={mediaUrl(mediaBase, profile.id, file)}
                alt=""
                draggable={false}
                className="absolute inset-0 size-full object-contain object-bottom select-none"
                style={{ visibility: "hidden" }}
              />
            );
          }),
        )}
      </div>
    </div>
  );
}
