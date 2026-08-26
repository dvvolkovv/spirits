import { describe, it, expect, vi } from 'vitest';
import { RoomEvent } from 'livekit-client';
import { waitForAgent } from './useVoiceCall';

/** Минимальная подделка Room: только то, чем пользуется waitForAgent. */
function fakeRoom(initial = 0) {
  const handlers: Record<string, ((...a: unknown[]) => void)[]> = {};
  const room = {
    remoteParticipants: new Map(Array.from({ length: initial }, (_, i) => [String(i), {}])),
    on(ev: string, h: (...a: unknown[]) => void) { (handlers[ev] ||= []).push(h); return room; },
    off(ev: string, h: (...a: unknown[]) => void) {
      handlers[ev] = (handlers[ev] || []).filter((x) => x !== h);
      return room;
    },
    /** Смоделировать вход участника. */
    join() {
      room.remoteParticipants.set(String(room.remoteParticipants.size), {});
      (handlers[RoomEvent.ParticipantConnected] || []).forEach((h) => h());
    },
    listenerCount(ev: string) { return (handlers[ev] || []).length; },
  };
  return room;
}

describe('waitForAgent', () => {
  it('агент УЖЕ в комнате — не ждём события', async () => {
    // Тот самый случай, что сломался вживую 26.08.2026: воркер вошёл раньше
    // нас, ParticipantConnected больше не придёт, и ожидание висело 15 секунд,
    // пока Роман говорил.
    const room = fakeRoom(1);
    await expect(waitForAgent(room as never)).resolves.toBe(true);
  });

  it('агент входит позже — дожидаемся события', async () => {
    const room = fakeRoom(0);
    const p = waitForAgent(room as never);
    room.join();
    await expect(p).resolves.toBe(true);
  });

  it('никто не пришёл — false по таймауту', async () => {
    vi.useFakeTimers();
    const room = fakeRoom(0);
    const p = waitForAgent(room as never);
    vi.advanceTimersByTime(20_000);
    await expect(p).resolves.toBe(false);
    vi.useRealTimers();
  });

  it('подписка снимается в любом исходе — слушатели не копятся', async () => {
    const room = fakeRoom(0);
    const p = waitForAgent(room as never);
    room.join();
    await p;
    expect(room.listenerCount(RoomEvent.ParticipantConnected)).toBe(0);
  });
});
