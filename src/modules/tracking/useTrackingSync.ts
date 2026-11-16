import { useEffect } from "react";
import { useSettings } from "@/modules/settings/store";
import { engine } from "@/modules/tracking/engine";

/** Keeps the devices in line with the settings; the engine itself never reads React. */
export function useTrackingSync() {
  const loaded = useSettings((s) => s.loaded);
  const cameraEnabled = useSettings((s) => s.settings.cameraEnabled);
  const cameraId = useSettings((s) => s.settings.cameraId);
  const micEnabled = useSettings((s) => s.settings.micEnabled);
  const micId = useSettings((s) => s.settings.micId);

  useEffect(() => {
    engine.start();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    if (cameraEnabled) void engine.startCamera(cameraId);
    else engine.stopCamera();
  }, [loaded, cameraEnabled, cameraId]);

  useEffect(() => {
    if (!loaded) return;
    if (micEnabled) void engine.startMic(micId);
    else engine.stopMic();
  }, [loaded, micEnabled, micId]);
}
