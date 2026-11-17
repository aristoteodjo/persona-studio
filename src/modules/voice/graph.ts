import { semitonesToRatio, type VoiceFx } from "@/modules/voice/presets";

const WORKLET_URL = "/worklets/pitch-shifter.js";
const RAMP = 0.03;

function impulse(ctx: BaseAudioContext, seconds: number, decay: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, length, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const data = buf.getChannelData(c);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
    }
  }
  return buf;
}

function crunchCurve(amount: number) {
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * amount) / Math.tanh(amount);
  }
  return curve;
}

/**
 * Real-time voice changer on the microphone:
 * source -> pitch -> [dry | radio] -> [dry | ring-mod robot] -> master,
 * with echo and reverb sends. Parameters move with short ramps so changing a
 * preset live never clicks. The output is a MediaStream for WebRTC.
 */
export class VoiceGraph {
  readonly stream: MediaStream;
  private pitch: AudioWorkletNode | null = null;
  private input: GainNode;
  private radioDry: GainNode;
  private radioWet: GainNode;
  private robotDry: GainNode;
  private robotWet: GainNode;
  private echoSend: GainNode;
  private reverbSend: GainNode;
  private master: GainNode;
  private monitor: GainNode;
  private destination: MediaStreamAudioDestinationNode;
  private carrier: OscillatorNode;
  private disposed = false;

  private constructor(
    private ctx: AudioContext,
    source: AudioNode,
  ) {
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.input = g();
    source.connect(this.input);

    const preRadio = g();
    this.radioDry = g(1);
    this.radioWet = g(0);
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 450;
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 3200;
    const crunch = ctx.createWaveShaper();
    crunch.curve = crunchCurve(3);
    preRadio.connect(this.radioDry);
    preRadio.connect(hp).connect(lp).connect(crunch).connect(this.radioWet);

    const preRobot = g();
    this.radioDry.connect(preRobot);
    this.radioWet.connect(preRobot);
    this.robotDry = g(1);
    this.robotWet = g(0);
    // Ring modulation: the carrier drives the gain of the voice signal.
    const ring = g(0);
    this.carrier = ctx.createOscillator();
    this.carrier.frequency.value = 55;
    this.carrier.connect(ring.gain);
    this.carrier.start();
    preRobot.connect(this.robotDry);
    preRobot.connect(ring).connect(this.robotWet);

    const mix = g();
    this.robotDry.connect(mix);
    this.robotWet.connect(mix);

    this.master = g(1);
    mix.connect(this.master);

    this.echoSend = g(0);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.28;
    const feedback = g(0.35);
    mix.connect(this.echoSend).connect(delay);
    delay.connect(feedback).connect(delay);
    delay.connect(this.master);

    this.reverbSend = g(0);
    const convolver = ctx.createConvolver();
    convolver.buffer = impulse(ctx, 2.4, 2.5);
    mix.connect(this.reverbSend).connect(convolver).connect(this.master);

    this.destination = ctx.createMediaStreamDestination();
    this.master.connect(this.destination);
    this.monitor = g(0);
    this.master.connect(this.monitor).connect(ctx.destination);
    this.stream = this.destination.stream;

    this.preRadio = preRadio;
  }

  private preRadio: GainNode;

  static async create(
    ctx: AudioContext,
    source: AudioNode,
  ): Promise<VoiceGraph> {
    const graph = new VoiceGraph(ctx, source);
    try {
      await ctx.audioWorklet.addModule(WORKLET_URL);
      graph.pitch = new AudioWorkletNode(ctx, "pitch-shifter");
      graph.input.connect(graph.pitch).connect(graph.preRadio);
    } catch (e) {
      // Without the worklet the voice still flows, only the pitch shift is lost.
      console.warn("pitch shifter unavailable", e);
      graph.input.connect(graph.preRadio);
    }
    return graph;
  }

  set(fx: VoiceFx) {
    if (this.disposed) return;
    const t = this.ctx.currentTime;
    const ramp = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, RAMP);
    const ratio = this.pitch?.parameters.get("ratio");
    if (ratio) ramp(ratio, semitonesToRatio(fx.pitch));
    ramp(this.radioWet.gain, fx.radio);
    ramp(this.radioDry.gain, 1 - fx.radio);
    ramp(this.robotWet.gain, fx.robot);
    ramp(this.robotDry.gain, 1 - fx.robot);
    ramp(this.echoSend.gain, fx.echo * 0.8);
    ramp(this.reverbSend.gain, fx.reverb * 1.2);
    ramp(this.master.gain, fx.volume);
  }

  setMonitor(on: boolean) {
    if (this.disposed) return;
    this.monitor.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, RAMP);
  }

  dispose() {
    this.disposed = true;
    this.carrier.stop();
    this.input.disconnect();
    this.master.disconnect();
    for (const t of this.stream.getTracks()) t.stop();
  }
}
