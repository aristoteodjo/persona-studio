import { useCallback, useEffect, useRef, useState } from "react";
import { AvatarStage } from "@/modules/avatar";
import { overlayKey, setOverlayKey } from "@/modules/overlay-link/key";
import { parseOverlayMessage } from "@/modules/overlay-link/protocol";
import type { Profile } from "@/modules/profiles/schema";
import { idleFrame, type RigFrame } from "@/modules/rig/rig";
import { VoiceReceiver } from "@/overlay/voice-receiver";

setOverlayKey(new URLSearchParams(location.search).get("key") ?? "");

function serverBase(): string {
  const port = new URLSearchParams(location.search).get("port");
  if (port && /^\d{2,5}$/.test(port)) return `http://127.0.0.1:${port}`;
  return location.origin;
}

/** OBS browser source: transparent page that renders whatever the studio streams to it. */
export function OverlayApp() {
  const base = serverBase();
  const debug = new URLSearchParams(location.search).has("debug");
  const [profile, setProfile] = useState<Profile | null>(null);
  const [connected, setConnected] = useState(false);
  const [voiceLive, setVoiceLive] = useState(false);
  const frameRef = useRef<RigFrame>(idleFrame());
  const getFrame = useCallback(() => frameRef.current, []);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry = 0;
    let timer = 0;
    let closed = false;
    const voice = new VoiceReceiver((msg) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    });
    voice.onLive = setVoiceLive;
    const connect = () => {
      ws = new WebSocket(
        `${base.replace(/^http/, "ws")}/ws?key=${overlayKey()}`,
      );
      ws.onopen = () => {
        retry = 0;
        setConnected(true);
      };
      ws.onmessage = (e) => {
        if (typeof e.data !== "string") return;
        const msg = parseOverlayMessage(e.data);
        if (!msg) return;
        if (msg.type === "frame") frameRef.current = msg.frame;
        else if (msg.type === "profile") setProfile(msg.profile);
        else void voice.handle(msg);
      };
      ws.onclose = () => {
        setConnected(false);
        voice.close();
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        timer = window.setTimeout(connect, 250 * 2 ** retry);
      };
    };
    connect();
    return () => {
      closed = true;
      voice.close();
      window.clearTimeout(timer);
      ws?.close();
    };
  }, [base]);

  return (
    <div style={{ position: "fixed", inset: 0 }}>
      {profile ? (
        <AvatarStage profile={profile} mediaBase={base} getFrame={getFrame} />
      ) : null}
      {debug ? (
        <div
          style={{
            position: "fixed",
            top: 8,
            left: 8,
            font: "12px system-ui",
            color: "#fff",
            background: "rgba(0,0,0,.6)",
            padding: "4px 8px",
            borderRadius: 6,
          }}
        >
          {connected ? "connecté" : "déconnecté"}
          {voiceLive ? " · voix" : ""} · {profile?.name ?? "aucun profil"}
        </div>
      ) : null}
    </div>
  );
}
