// Delay-line pitch shifter: two read heads sweep a short buffer at the target
// rate and crossfade with complementary Hann windows, so the sum stays flat.
const WINDOW = 2048;
const SIZE = WINDOW * 2;

class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: "ratio", defaultValue: 1, minValue: 0.25, maxValue: 4, automationRate: "k-rate" }];
  }

  constructor() {
    super();
    this.buffer = new Float32Array(SIZE);
    this.write = 0;
    this.phase = 0;
  }

  read(delay) {
    let pos = this.write - delay;
    while (pos < 0) pos += SIZE;
    const i = Math.floor(pos);
    const frac = pos - i;
    const a = this.buffer[i % SIZE];
    const b = this.buffer[(i + 1) % SIZE];
    return a + (b - a) * frac;
  }

  process(inputs, outputs, parameters) {
    const input = inputs[0]?.[0];
    const output = outputs[0];
    if (!input || !output?.[0]) return true;
    const ratio = parameters.ratio[0];
    const out = output[0];
    if (Math.abs(ratio - 1) < 1e-3) {
      out.set(input);
    } else {
      const step = (1 - ratio) / WINDOW;
      for (let n = 0; n < input.length; n++) {
        this.buffer[this.write] = input[n];
        this.phase += step;
        this.phase -= Math.floor(this.phase);
        const p2 = (this.phase + 0.5) % 1;
        const g1 = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.phase);
        const g2 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p2);
        // The +1 keeps the read head strictly behind the write head.
        out[n] = this.read(this.phase * WINDOW + 1) * g1 + this.read(p2 * WINDOW + 1) * g2;
        this.write = (this.write + 1) % SIZE;
      }
    }
    for (let c = 1; c < output.length; c++) output[c].set(out);
    return true;
  }
}

registerProcessor("pitch-shifter", PitchShifter);
