// Потоковая диктовка: микрофон → PCM16/16k → WebSocket (/voice/stream) →
// серверный SpeechKit STT → partial/final текст. Работает в iOS Safari
// (getUserMedia + AudioWorklet + WebSocket), в отличие от Web Speech API.
import { tokenManager } from '../utils/tokenManager';

export interface VoiceDictationCallbacks {
  onPartial?: (text: string) => void;
  onFinal?: (text: string) => void;
  onReady?: () => void;
  onError?: (message: string) => void;
  onClose?: () => void;
}

export class VoiceDictation {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private sink: GainNode | null = null;   // тихий сток (gain 0) — чтобы iOS «тянул» граф
  private ws: WebSocket | null = null;
  private stopped = false;

  get active(): boolean {
    return !!this.ws && !this.stopped;
  }

  static get supported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
      typeof AudioWorkletNode !== 'undefined' && 'WebSocket' in window);
  }

  async start(cb: VoiceDictationCallbacks): Promise<void> {
    const token = tokenManager.getAccessToken();
    if (!token) { cb.onError?.('no_auth'); return; }

    this.stopped = false;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      cb.onError?.('mic_denied');
      return;
    }

    this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    // iOS Safari: AudioContext стартует в 'suspended' — без res() worklet не
    // обрабатывает звук (главная причина «не работает на iOS»). resume в рамках
    // пользовательского жеста (клик по микрофону) iOS разрешает.
    try { if (this.ctx.state === 'suspended') await this.ctx.resume(); } catch {}
    try {
      await this.ctx.audioWorklet.addModule('/pcm-recorder-worklet.js');
    } catch (e) {
      cb.onError?.('worklet_failed');
      await this.cleanup();
      return;
    }

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/voice/stream?token=${encodeURIComponent(token)}`);
    this.ws.binaryType = 'arraybuffer';

    this.ws.onmessage = (ev) => {
      let m: any;
      try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'partial') cb.onPartial?.(m.text);
      else if (m.type === 'final') cb.onFinal?.(m.text);
      else if (m.type === 'ready') cb.onReady?.();
      else if (m.type === 'error') cb.onError?.(m.message || 'stt_error');
      else if (m.type === 'done') { /* финал отдан, сервер закроет сокет */ }
    };
    this.ws.onerror = () => cb.onError?.('ws_error');
    this.ws.onclose = () => { cb.onClose?.(); this.cleanup(); };

    this.source = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, 'pcm-recorder');
    this.node.port.onmessage = (ev: MessageEvent) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(ev.data);
    };
    // источник → ворклет → тихий gain(0) → выход. iOS Safari вызывает process()
    // только если граф доходит до destination; gain=0 убирает эхо. (На десктопе
    // работало и без стока, но iOS без него молчит.)
    this.sink = this.ctx.createGain();
    this.sink.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(this.sink);
    this.sink.connect(this.ctx.destination);
  }

  /** Завершить речь: попросить сервер отдать финал, затем закрыть. */
  stop(): void {
    this.stopped = true;
    try {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'stop' }));
      } else {
        this.cleanup();
      }
    } catch { this.cleanup(); }
    // подстраховка: если сервер не закрыл сам — закрыть через 4с
    setTimeout(() => { try { this.ws?.close(); } catch {} }, 4000);
  }

  private async cleanup(): Promise<void> {
    try { this.source?.disconnect(); } catch {}
    try { this.node?.disconnect(); } catch {}
    try { this.sink?.disconnect(); } catch {}
    try { this.stream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { if (this.ctx && this.ctx.state !== 'closed') await this.ctx.close(); } catch {}
    this.source = null; this.node = null; this.sink = null; this.stream = null; this.ctx = null; this.ws = null;
  }
}
