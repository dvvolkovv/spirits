import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startRingback } from './ringback';

/** Подделка Web Audio: считаем, что создали и что закрыли. */
function installFakeAudio() {
  const state = { started: 0, stopped: 0, closed: 0, envelope: [] as number[] };
  class FakeAudioContext {
    currentTime = 0;
    destination = {};
    createOscillator() {
      return {
        type: '', frequency: { value: 0 }, connect: () => {},
        start: () => { state.started++; },
        stop: () => { state.stopped++; },
      };
    }
    createGain() {
      return {
        gain: { value: 0, setValueAtTime: (v: number) => { state.envelope.push(v); } },
        connect: () => {},
      };
    }
    close() { state.closed++; return Promise.resolve(); }
  }
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  return state;
}

describe('startRingback', () => {
  let state: ReturnType<typeof installFakeAudio>;
  beforeEach(() => { state = installFakeAudio(); });
  afterEach(() => { vi.restoreAllMocks(); });

  it('запускает тон и расписывает пачки гудков заранее', () => {
    const rb = startRingback();
    expect(state.started).toBe(1);
    // Каждый цикл — открытие и закрытие громкости.
    expect(state.envelope.length).toBeGreaterThan(4);
    expect(state.envelope).toContain(0);
    rb.stop();
  });

  it('stop() глушит осциллятор и закрывает контекст', () => {
    const rb = startRingback();
    rb.stop();
    expect(state.stopped).toBe(1);
    expect(state.closed).toBe(1);
  });

  it('повторный stop() безопасен — вызывается из нескольких точек выхода', () => {
    const rb = startRingback();
    rb.stop(); rb.stop(); rb.stop();
    expect(state.stopped).toBe(1);
    expect(state.closed).toBe(1);
  });

  it('без Web Audio не падает, а молча отдаёт заглушку', () => {
    (globalThis as unknown as { AudioContext: unknown }).AudioContext = undefined;
    const rb = startRingback();
    expect(() => rb.stop()).not.toThrow();
  });
});
