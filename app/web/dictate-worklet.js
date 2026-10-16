// Layr-Diktat: sammelt das Mikrofon-Signal (16 kHz, mono) in 100-ms-Stücken und gibt sie an die Seite weiter.
// Die Daten bleiben im Programm; erkannt wird auf diesem Rechner.
class LayrDictate extends AudioWorkletProcessor {
  constructor() { super(); this.buf = new Float32Array(1600); this.n = 0; }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) for (let i = 0; i < ch.length; i++) { this.buf[this.n++] = ch[i]; if (this.n === this.buf.length) { this.port.postMessage(this.buf, [this.buf.buffer]); this.buf = new Float32Array(1600); this.n = 0; } }
    return true;
  }
}
registerProcessor('layr-dictate', LayrDictate);
