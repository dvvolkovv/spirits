// AudioWorklet: захват микрофона → даунсемпл до 16 кГц → Int16 LE PCM.
// Постит ArrayBuffer в основной поток каждые ~100мс (1600 сэмплов @16кГц).
// `sampleRate` — глобал в AudioWorkletGlobalScope (частота AudioContext).
class PCMRecorder extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._inRate = sampleRate;
    this._target = 16000;
    this._chunkOut = 1600; // 100мс на 16кГц
  }

  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const ch = input[0];
      for (let i = 0; i < ch.length; i++) this._buf.push(ch[i]);
    }
    const ratio = this._inRate / this._target;
    const need = Math.floor(this._chunkOut * ratio);
    while (this._buf.length >= need) {
      const inS = this._buf.splice(0, need);
      const outLen = Math.floor(inS.length / ratio);
      const pcm = new Int16Array(outLen);
      for (let i = 0; i < outLen; i++) {
        let v = inS[Math.floor(i * ratio)];
        v = Math.max(-1, Math.min(1, v));
        pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}

registerProcessor('pcm-recorder', PCMRecorder);
