import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { create } from "zustand";
import {
  type IceCandidate,
  parseRtcMessage,
  type RtcMessage,
} from "@/modules/overlay-link/protocol";

type ClientEvent = { id: number; connected: boolean };
type SignalEvent = { from: number; message: string };

/** How many overlays currently receive the changed voice. */
export const useVoiceLinks = create<{ live: number }>(() => ({ live: 0 }));

const send = (to: number, msg: RtcMessage) =>
  invoke("overlay_send", { to, message: JSON.stringify(msg) }).catch((e) =>
    console.warn("signal send failed", e),
  );

const toCandidate = (c: RTCIceCandidate): IceCandidate => ({
  candidate: c.candidate,
  sdpMid: c.sdpMid,
  sdpMLineIndex: c.sdpMLineIndex,
});

/**
 * Sends the changed voice to every connected overlay over a loopback WebRTC
 * link. Signaling rides on the overlay WebSocket through the Rust hub.
 */
class VoiceSender {
  private stream: MediaStream | null = null;
  private clients = new Set<number>();
  private peers = new Map<number, RTCPeerConnection>();
  private started = false;

  private start() {
    if (this.started) return;
    this.started = true;
    invoke<number[]>("overlay_clients")
      .then((ids) => {
        for (const id of ids) this.onClient({ id, connected: true });
      })
      .catch(() => {});
    listen<ClientEvent>("overlay://client", (e) =>
      this.onClient(e.payload),
    ).catch(() => {});
    listen<SignalEvent>("overlay://signal", (e) =>
      this.onSignal(e.payload),
    ).catch(() => {});
  }

  setStream(stream: MediaStream | null) {
    this.start();
    if (stream === this.stream) return;
    this.stream = stream;
    for (const id of [...this.peers.keys()]) this.close(id, true);
    if (stream) for (const id of this.clients) void this.connect(id);
  }

  private onClient({ id, connected }: ClientEvent) {
    if (connected) {
      this.clients.add(id);
      if (this.stream) void this.connect(id);
    } else {
      this.clients.delete(id);
      this.close(id, false);
    }
  }

  private async connect(id: number) {
    const stream = this.stream;
    if (!stream || this.peers.has(id)) return;
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.peers.set(id, pc);
    for (const track of stream.getAudioTracks()) pc.addTrack(track, stream);
    pc.onicecandidate = (e) => {
      if (e.candidate)
        void send(id, { type: "rtc-ice", candidate: toCandidate(e.candidate) });
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this.close(id, true);
      this.refresh();
    };
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      if (offer.sdp) await send(id, { type: "rtc-offer", sdp: offer.sdp });
    } catch (e) {
      console.warn("voice offer failed", e);
      this.close(id, false);
    }
  }

  private async onSignal({ from, message }: SignalEvent) {
    const pc = this.peers.get(from);
    if (!pc) return;
    let data: unknown;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }
    const msg = parseRtcMessage(data);
    try {
      if (msg?.type === "rtc-answer") {
        await pc.setRemoteDescription({ type: "answer", sdp: msg.sdp });
      } else if (msg?.type === "rtc-ice") {
        await pc.addIceCandidate(msg.candidate);
      }
    } catch (e) {
      console.warn("voice signaling failed", e);
    }
  }

  private close(id: number, notify: boolean) {
    const pc = this.peers.get(id);
    if (!pc) return;
    pc.close();
    this.peers.delete(id);
    if (notify) void send(id, { type: "rtc-close" });
    this.refresh();
  }

  private refresh() {
    let live = 0;
    for (const pc of this.peers.values())
      if (pc.connectionState === "connected") live++;
    useVoiceLinks.setState({ live });
  }
}

export const voiceSender = new VoiceSender();
