import type { GuestEvent } from './guestTypes';

/** Склейка NDJSON: куски потока режутся где угодно, событие — только целая строка. */
export function createLineSplitter(): (chunk: string) => string[] {
  let buf = '';
  return (chunk: string) => {
    buf += chunk;
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    return lines.map((l) => l.trim()).filter(Boolean);
  };
}

export function parseGuestEvent(line: string): GuestEvent | null {
  let raw: any;
  try {
    raw = JSON.parse(line);
  } catch {
    return null;
  }
  switch (raw?.type) {
    case 'guest':
      return { type: 'guest', left: Math.max(0, Number(raw.left) || 0), ...(typeof raw.token === 'string' ? { token: raw.token } : {}) };
    case 'begin':
      return { type: 'begin' };
    case 'ping':
      return { type: 'ping' };
    case 'item':
      return typeof raw.content === 'string' ? { type: 'item', content: raw.content } : null;
    case 'end':
      return typeof raw.content === 'string' ? { type: 'end', content: raw.content } : null;
    case 'wall':
      return raw.reason === 'limit' || raw.reason === 'closed' ? { type: 'wall', reason: raw.reason } : null;
    case 'error':
      return { type: 'error', code: raw.code === 'busy' ? 'busy' : 'model' };
    default:
      return null;
  }
}

export async function readGuestStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (e: GuestEvent) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  const split = createLineSplitter();
  const emit = (text: string) => {
    for (const line of split(text)) {
      const ev = parseGuestEvent(line);
      if (ev) onEvent(ev);
    }
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    emit(decoder.decode(value, { stream: true }));
  }
  emit(decoder.decode() + '\n');
}
