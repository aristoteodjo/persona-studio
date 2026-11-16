import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useState } from "react";
import { encodeFrame, encodeProfile } from "@/modules/overlay-link/protocol";
import type { Profile } from "@/modules/profiles/schema";
import type { RigFrame } from "@/modules/rig/rig";

export type OverlayInfo = { port: number; url: string; clients: number };

const EMPTY: OverlayInfo = { port: 0, url: "", clients: 0 };
let info: OverlayInfo = EMPTY;
const listeners = new Set<(i: OverlayInfo) => void>();

function setInfo(next: OverlayInfo) {
  info = next;
  for (const l of listeners) l(next);
}

let started = false;
function ensureStarted() {
  if (started) return;
  started = true;
  invoke<OverlayInfo>("overlay_info")
    .then(setInfo)
    .catch(() => {});
  listen<OverlayInfo>("overlay://info", (e) => setInfo(e.payload)).catch(
    () => {},
  );
}

export function useOverlayInfo(): OverlayInfo {
  const [state, setState] = useState(info);
  useEffect(() => {
    ensureStarted();
    listeners.add(setState);
    setState(info);
    return () => {
      listeners.delete(setState);
    };
  }, []);
  return state;
}

/** Base URL of the local server that serves imported images. */
export function mediaBase(): string {
  return info.port ? `http://127.0.0.1:${info.port}` : "";
}

export function pushProfile(profile: Profile | null) {
  invoke("overlay_set_profile", { message: encodeProfile(profile) }).catch(
    (e) => console.error("overlay profile push failed", e),
  );
}

/** Frames only cross IPC while at least one overlay is connected. */
export function pushFrame(frame: RigFrame) {
  ensureStarted();
  if (info.clients === 0) return;
  invoke("overlay_push_frame", { message: encodeFrame(frame) }).catch(() => {});
}
