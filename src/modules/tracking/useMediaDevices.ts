import { useEffect, useState } from "react";
import { useTracking } from "@/modules/tracking/engine";

export type Device = { id: string; label: string };

/** Lists cameras and microphones; labels appear once a permission was granted. */
export function useMediaDevices() {
  const [cameras, setCameras] = useState<Device[]>([]);
  const [mics, setMics] = useState<Device[]>([]);
  const camera = useTracking((s) => s.camera);
  const mic = useTracking((s) => s.mic);

  // Device labels only appear after a permission grant, so status changes re-list them.
  // biome-ignore lint/correctness/useExhaustiveDependencies: camera and mic are refresh triggers
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try {
        const all = await navigator.mediaDevices.enumerateDevices();
        if (!alive) return;
        const pick = (kind: MediaDeviceKind, fallback: string) =>
          all
            .filter((d) => d.kind === kind && d.deviceId)
            .map((d, i) => ({
              id: d.deviceId,
              label: d.label || `${fallback} ${i + 1}`,
            }));
        setCameras(pick("videoinput", "Caméra"));
        setMics(pick("audioinput", "Micro"));
      } catch (e) {
        console.warn("device enumeration failed", e);
      }
    };
    void refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => {
      alive = false;
      navigator.mediaDevices.removeEventListener("devicechange", refresh);
    };
  }, [camera, mic]);

  return { cameras, mics };
}
