import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { create } from "zustand";
import { pushFrame } from "@/modules/overlay-link";
import { type VoiceConfig, voiceSchema } from "@/modules/profiles/schema";
import {
  autoBlink,
  calibrationFrom,
  clamp,
  type FaceSignals,
  faceSignals,
  idleFrame,
  NEUTRAL_CALIBRATION,
  type RigFrame,
  rmsToLevel,
  signalsToFace,
  smoothFrame,
  type TalkState,
  updateTalk,
} from "@/modules/rig/rig";
import { getSettings, useSettings } from "@/modules/settings/store";
import { faceLandmarker } from "@/modules/tracking/vision";
import { VoiceGraph } from "@/modules/voice/graph";
import { type ShoutState, updateShout } from "@/modules/voice/presets";
import { voiceSender } from "@/modules/voice/rtc";

export type DeviceStatus = "off" | "starting" | "on" | "error";

type TrackingStatus = {
  camera: DeviceStatus;
  cameraError: string | null;
  mic: DeviceStatus;
  micError: string | null;
  face: boolean;
  level: number;
  fps: number;
  expressionId: string | null;
};

/** Low-frequency status for the UI; per-frame data never goes through React. */
export const useTracking = create<TrackingStatus>(() => ({
  camera: "off",
  cameraError: null,
  mic: "off",
  micError: null,
  face: false,
  level: 0,
  fps: 0,
  expressionId: null,
}));

export const setExpression = (id: string | null) =>
  useTracking.setState({ expressionId: id });

const TICK_MS = 33;

let latest: RigFrame = idleFrame();
export const getLiveFrame = () => latest;

function mediaError(e: unknown): string {
  if (e instanceof DOMException) {
    if (e.name === "NotAllowedError")
      return "Accès refusé. Autorise-le dans Réglages système > Confidentialité.";
    if (e.name === "NotFoundError") return "Aucun périphérique trouvé.";
    if (e.name === "NotReadableError")
      return "Périphérique déjà utilisé par une autre application.";
  }
  return e instanceof Error ? e.message : String(e);
}

class Engine {
  private video: HTMLVideoElement | null = null;
  private camStream: MediaStream | null = null;
  private landmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;
  private signals: FaceSignals | null = null;
  private lastFaceAt = 0;

  private micStream: MediaStream | null = null;
  private audioCtx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private samples: Float32Array<ArrayBuffer> | null = null;
  private talk: TalkState = { talking: false, lastLoud: 0 };
  private shout: ShoutState = { shouting: false, lastLoud: 0 };
  private source: MediaStreamAudioSourceNode | null = null;
  private voiceGraph: VoiceGraph | null = null;
  private voiceBuilding = false;
  private voiceCfg: VoiceConfig = voiceSchema.parse({});
  private monitor = false;

  private clock: Worker | null = null;
  private timer = 0;
  private calibrateNext = false;
  private camToken = 0;
  private micToken = 0;
  private frames = 0;
  private statsAt = 0;

  /**
   * The clock lives in a worker: WebKit throttles page timers when the window
   * is not frontmost, which is exactly when streaming with OBS focused.
   */
  start() {
    if (this.clock || this.timer) return;
    try {
      const src = `setInterval(() => postMessage(0), ${TICK_MS});`;
      const url = URL.createObjectURL(
        new Blob([src], { type: "text/javascript" }),
      );
      this.clock = new Worker(url);
      this.clock.onmessage = () => this.tick();
    } catch (e) {
      console.warn("worker clock unavailable, falling back to page timer", e);
      this.timer = window.setInterval(() => this.tick(), TICK_MS);
    }
  }

  async startCamera(deviceId: string | null) {
    const token = ++this.camToken;
    this.stopCamera(false);
    useTracking.setState({ camera: "starting", cameraError: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 },
        },
      });
      if (token !== this.camToken) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      const video = document.createElement("video");
      video.muted = true;
      video.playsInline = true;
      video.srcObject = stream;
      await video.play();
      this.landmarker = await faceLandmarker("VIDEO");
      if (token !== this.camToken) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      this.camStream = stream;
      this.video = video;
      this.lastVideoTime = -1;
      useTracking.setState({ camera: "on" });
    } catch (e) {
      if (token === this.camToken) {
        useTracking.setState({ camera: "error", cameraError: mediaError(e) });
      }
    }
  }

  stopCamera(updateStatus = true) {
    for (const t of this.camStream?.getTracks() ?? []) t.stop();
    this.camStream = null;
    if (this.video) this.video.srcObject = null;
    this.video = null;
    this.signals = null;
    if (updateStatus) {
      this.camToken++;
      useTracking.setState({ camera: "off", cameraError: null, face: false });
    }
  }

  async startMic(deviceId: string | null) {
    const token = ++this.micToken;
    this.stopMic(false);
    useTracking.setState({ mic: "starting", micError: null });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,
          noiseSuppression: true,
          autoGainControl: false,
        },
      });
      if (token !== this.micToken) {
        for (const t of stream.getTracks()) t.stop();
        return;
      }
      const ctx = new AudioContext({ latencyHint: "interactive" });
      void ctx.resume().catch(() => {});
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      const source = ctx.createMediaStreamSource(stream);
      source.connect(analyser);
      this.micStream = stream;
      this.audioCtx = ctx;
      this.source = source;
      this.analyser = analyser;
      this.samples = new Float32Array(analyser.fftSize);
      useTracking.setState({ mic: "on" });
      this.syncVoice();
    } catch (e) {
      if (token === this.micToken) {
        useTracking.setState({ mic: "error", micError: mediaError(e) });
      }
    }
  }

  stopMic(updateStatus = true) {
    this.dropVoiceGraph();
    this.source = null;
    for (const t of this.micStream?.getTracks() ?? []) t.stop();
    this.micStream = null;
    this.audioCtx?.close().catch(() => {});
    this.audioCtx = null;
    this.analyser = null;
    this.samples = null;
    this.talk = { talking: false, lastLoud: 0 };
    if (updateStatus) {
      this.micToken++;
      useTracking.setState({ mic: "off", micError: null, level: 0 });
    }
  }

  /** Voice settings of the active persona plus the global "hear myself" switch. */
  setVoice(cfg: VoiceConfig, monitor: boolean) {
    this.voiceCfg = cfg;
    this.monitor = monitor;
    this.syncVoice();
  }

  private syncVoice() {
    const ctx = this.audioCtx;
    const source = this.source;
    const changer = this.voiceCfg.changer;
    if (!ctx || !source || !changer.enabled) {
      this.dropVoiceGraph();
      return;
    }
    if (this.voiceGraph) {
      this.voiceGraph.set(changer);
      this.voiceGraph.setMonitor(this.monitor);
      return;
    }
    if (this.voiceBuilding) return;
    this.voiceBuilding = true;
    VoiceGraph.create(ctx, source)
      .then((graph) => {
        this.voiceBuilding = false;
        // The mic may have restarted or the changer been switched off meanwhile.
        if (this.audioCtx !== ctx || !this.voiceCfg.changer.enabled) {
          graph.dispose();
          this.syncVoice();
          return;
        }
        this.voiceGraph = graph;
        graph.set(this.voiceCfg.changer);
        graph.setMonitor(this.monitor);
        voiceSender.setStream(graph.stream);
      })
      .catch((e) => {
        this.voiceBuilding = false;
        console.error("voice changer failed", e);
      });
  }

  private dropVoiceGraph() {
    if (!this.voiceGraph) return;
    voiceSender.setStream(null);
    this.voiceGraph.dispose();
    this.voiceGraph = null;
  }

  calibrate() {
    this.calibrateNext = true;
  }

  private readFace(now: number) {
    const video = this.video;
    const lm = this.landmarker;
    if (!video || !lm || video.readyState < 2) return;
    if (video.currentTime === this.lastVideoTime) return;
    this.lastVideoTime = video.currentTime;
    const result = lm.detectForVideo(video, now);
    const face = result.faceLandmarks[0];
    if (!face) {
      this.signals = null;
      return;
    }
    const shapes: Record<string, number> = {};
    for (const c of result.faceBlendshapes[0]?.categories ?? []) {
      shapes[c.categoryName] = c.score;
    }
    this.signals = faceSignals(
      face,
      shapes,
      video.videoWidth,
      video.videoHeight,
    );
    if (this.signals) this.lastFaceAt = now;
  }

  private readVoice(): number {
    const a = this.analyser;
    const buf = this.samples;
    if (!a || !buf) return 0;
    a.getFloatTimeDomainData(buf);
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      const v = buf[i] ?? 0;
      sum += v * v;
    }
    return rmsToLevel(Math.sqrt(sum / buf.length));
  }

  private tick() {
    const now = performance.now();
    const settings = getSettings();
    try {
      this.readFace(now);
    } catch (e) {
      console.error("face tracking failed", e);
    }
    const level = this.readVoice();
    const voice = this.voiceCfg;
    const threshold = voice.threshold ?? settings.micThreshold;
    this.talk = updateTalk(this.talk, level, now, threshold);
    this.shout = updateShout(
      this.shout,
      level,
      now,
      Math.max(voice.shoutLevel, threshold),
    );

    const s = this.signals;
    if (s && (this.calibrateNext || !settings.calibration)) {
      this.calibrateNext = false;
      useSettings.getState().set({ calibration: calibrationFrom(s) });
    }

    const target = idleFrame(now);
    target.expressionId = useTracking.getState().expressionId;
    target.voice = level;
    const hasFace = s !== null && now - this.lastFaceAt < 500;
    target.face = hasFace;
    if (s && hasFace) {
      Object.assign(
        target,
        signalsToFace(s, {
          mirror: settings.mirror,
          calibration: settings.calibration ?? NEUTRAL_CALIBRATION,
        }),
      );
    } else {
      const b = autoBlink(now);
      target.blinkL = b;
      target.blinkR = b;
    }

    const faceMouth = hasFace ? target.mouthOpen : 0;
    const voiceMouth = this.talk.talking
      ? clamp((0.35 + level * 0.9) * voice.mouthGain, 0, 1)
      : 0;
    const src = settings.mouthSource;
    const micOn = this.analyser !== null;
    if (src === "face" || !micOn) {
      target.mouthOpen = faceMouth;
      target.talking = faceMouth > 0.3;
    } else if (src === "voice") {
      target.mouthOpen = voiceMouth;
      target.talking = this.talk.talking;
    } else {
      target.mouthOpen = Math.max(faceMouth, voiceMouth);
      target.talking = this.talk.talking || faceMouth > 0.3;
    }

    if (this.shout.shouting && this.analyser) {
      // Shouting: a chosen 2D expression, or raised brows and a wide mouth on other avatars.
      if (voice.shoutExpressionId)
        target.expressionId = voice.shoutExpressionId;
      target.browUp = Math.max(target.browUp, 0.9);
      target.mouthOpen = Math.max(target.mouthOpen, 0.9);
    }

    latest = smoothFrame(latest, target, settings.smoothing * 160);
    // Mouth snaps shut when talking stops so it never lingers half open.
    if (!target.talking && target.mouthOpen === 0) {
      latest.mouthOpen = Math.min(latest.mouthOpen, 0.5);
    }
    pushFrame(latest);

    this.frames++;
    if (now - this.statsAt > 250) {
      const fps = (this.frames * 1000) / (now - this.statsAt || 1);
      this.frames = 0;
      this.statsAt = now;
      useTracking.setState({ face: hasFace, level, fps: Math.round(fps) });
    }
  }
}

export const engine = new Engine();
