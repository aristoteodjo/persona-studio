import { getCurrentWebview } from "@tauri-apps/api/webview";
import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useRef, useState } from "react";

const IMAGE_FILTER = {
  name: "Images",
  extensions: ["png", "jpg", "jpeg", "webp", "gif"],
};

export async function pickImage(): Promise<string | null> {
  const picked = await open({
    multiple: false,
    directory: false,
    filters: [IMAGE_FILTER],
  });
  return typeof picked === "string" ? picked : null;
}

export const DROP_ATTR = "data-drop-target";

const dropTargets = new Map<string, (path: string) => void>();

/** Mounted drop zones register here; the window-level drop listener routes paths to them. */
export function useDropTarget(id: string, onPath: (path: string) => void) {
  const ref = useRef(onPath);
  ref.current = onPath;
  useEffect(() => {
    const fn = (path: string) => ref.current(path);
    dropTargets.set(id, fn);
    return () => {
      if (dropTargets.get(id) === fn) dropTargets.delete(id);
    };
  }, [id]);
}

/**
 * Native file drops carry paths, not File objects. The drop position picks the
 * element marked with data-drop-target and hands it the first path.
 */
export function useFileDrop() {
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    const targetAt = (x: number, y: number) => {
      const dpr = window.devicePixelRatio || 1;
      const el = document.elementFromPoint(x / dpr, y / dpr);
      return (
        el?.closest<HTMLElement>(`[${DROP_ATTR}]`)?.getAttribute(DROP_ATTR) ??
        null
      );
    };
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const p = event.payload;
      if (p.type === "over") setHover(targetAt(p.position.x, p.position.y));
      else if (p.type === "leave") setHover(null);
      else if (p.type === "drop") {
        setHover(null);
        const target = targetAt(p.position.x, p.position.y);
        const path = p.paths[0];
        if (target && path) dropTargets.get(target)?.(path);
      }
    });
    return () => {
      void unlisten.then((f) => f());
    };
  }, []);

  return hover;
}
