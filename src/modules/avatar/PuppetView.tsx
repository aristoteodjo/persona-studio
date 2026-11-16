import { useEffect, useMemo, useRef, useState } from "react";
import { fitBox, mediaUrl } from "@/modules/avatar/layout";
import { buildPuppetMesh, deformPuppet } from "@/modules/avatar/puppet/mesh";
import { PuppetRenderer } from "@/modules/avatar/puppet/renderer";
import { isPuppetReady, type PuppetProfile } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

type Props = {
  profile: PuppetProfile;
  mediaBase: string;
  getFrame: () => RigFrame;
  onError?: (message: string) => void;
};

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image introuvable"));
    img.src = src;
  });
}

export function PuppetView({ profile, mediaBase, getFrame, onError }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const { puppet } = profile;
  const ready = isPuppetReady(puppet);
  const src =
    ready && puppet.image
      ? mediaUrl(mediaBase, profile.id, puppet.image)
      : null;

  const settingsRef = useRef({ motion: profile.motion, puppet });
  settingsRef.current = { motion: profile.motion, puppet };

  useEffect(() => {
    if (!src) {
      setImage(null);
      return;
    }
    let alive = true;
    loadImage(src)
      .then((img) => alive && setImage(img))
      .catch((e: Error) => alive && onError?.(e.message));
    return () => {
      alive = false;
    };
  }, [src, onError]);

  const mesh = useMemo(() => {
    if (!ready || puppet.width === null || puppet.height === null) return null;
    try {
      return buildPuppetMesh(puppet.landmarks, puppet.width, puppet.height);
    } catch {
      return null;
    }
  }, [ready, puppet.landmarks, puppet.width, puppet.height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !mesh || !image) return;
    let renderer: PuppetRenderer;
    try {
      renderer = new PuppetRenderer(
        canvas,
        mesh,
        image,
        settingsRef.current.puppet.mouthColor,
      );
    } catch (e) {
      onError?.(e instanceof Error ? e.message : "rendu impossible");
      return;
    }
    const positions = new Float32Array(mesh.vertexCount * 2);
    let raf = 0;
    const tick = (now: number) => {
      raf = requestAnimationFrame(tick);
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(canvas.clientWidth * dpr);
      const h = Math.round(canvas.clientHeight * dpr);
      if (w === 0 || h === 0) return;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const { motion, puppet: cfg } = settingsRef.current;
      renderer.setMouthColor(cfg.mouthColor);
      const frame = getFrame();
      deformPuppet(mesh, frame, { head: motion.head, config: cfg }, positions);
      const box = fitBox(w, h, mesh.width, mesh.height, motion);
      const breath = Math.sin(now / 900) * 0.004 * motion.breath * box.height;
      renderer.draw(positions, {
        x: box.x,
        y: box.y + breath,
        scale: box.scale,
      });
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      renderer.dispose();
    };
  }, [mesh, image, getFrame, onError]);

  return <canvas ref={canvasRef} className="absolute inset-0 size-full" />;
}
