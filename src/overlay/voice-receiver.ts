import type { IceCandidate, RtcMessage } from "@/modules/overlay-link/protocol";

/** Plays the studio's changed voice; OBS picks it up with "Control audio via OBS". */
export class VoiceReceiver {
  private pc: RTCPeerConnection | null = null;
  private audio = new Audio();
  onLive: (live: boolean) => void = () => {};

  constructor(private send: (msg: RtcMessage) => void) {
    this.audio.autoplay = true;
  }

  async handle(msg: RtcMessage) {
    if (msg.type === "rtc-close") return this.close();
    if (msg.type === "rtc-ice") {
      await this.pc?.addIceCandidate(msg.candidate).catch(() => {});
      return;
    }
    if (msg.type !== "rtc-offer") return;
    this.close();
    const pc = new RTCPeerConnection({ iceServers: [] });
    this.pc = pc;
    pc.ontrack = (e) => {
      this.audio.srcObject = e.streams[0] ?? new MediaStream([e.track]);
      this.audio
        .play()
        .catch((err) => console.warn("voice playback blocked", err));
    };
    pc.onicecandidate = (e) => {
      if (!e.candidate) return;
      const candidate: IceCandidate = {
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
      };
      this.send({ type: "rtc-ice", candidate });
    };
    pc.onconnectionstatechange = () =>
      this.onLive(pc.connectionState === "connected");
    try {
      await pc.setRemoteDescription({ type: "offer", sdp: msg.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (answer.sdp) this.send({ type: "rtc-answer", sdp: answer.sdp });
    } catch (e) {
      console.warn("voice answer failed", e);
      this.close();
    }
  }

  close() {
    this.pc?.close();
    this.pc = null;
    this.audio.srcObject = null;
    this.onLive(false);
  }
}
