import { describe, expect, it } from 'vitest';
import { createLineSplitter, parseGuestEvent, readGuestStream } from './guestStream';
import type { GuestEvent } from './guestTypes';

describe('поток хода гостя', () => {
  it('строки склеиваются через границы кусков', () => {
    const split = createLineSplitter();
    expect(split('{"type":"be')).toEqual([]);
    expect(split('gin"}\n{"type":"item","content":"а"}\n{"ty')).toEqual(['{"type":"begin"}', '{"type":"item","content":"а"}']);
    expect(split('pe":"ping"}\n')).toEqual(['{"type":"ping"}']);
  });

  it('незнакомое, битое и без полей — пропускается; код ошибки по умолчанию — model', () => {
    expect(parseGuestEvent('не json')).toBeNull();
    expect(parseGuestEvent('{"type":"what"}')).toBeNull();
    expect(parseGuestEvent('{"type":"item"}')).toBeNull();
    expect(parseGuestEvent('{"type":"wall","reason":"x"}')).toBeNull();
    expect(parseGuestEvent('{"type":"error","code":"x"}')).toEqual({ type: 'error', code: 'model' });
    expect(parseGuestEvent('{"type":"guest","left":2,"token":"T"}')).toEqual({ type: 'guest', left: 2, token: 'T' });
  });

  it('многобайтный знак на границе кусков не ломается', async () => {
    const bytes = new TextEncoder().encode('{"type":"item","content":"Привет"}\n{"type":"end","content":"Привет"}\n');
    const cut = 30; // посреди кириллицы
    const stream = new ReadableStream<Uint8Array>({
      start(c) { c.enqueue(bytes.slice(0, cut)); c.enqueue(bytes.slice(cut)); c.close(); },
    });
    const got: GuestEvent[] = [];
    await readGuestStream(stream.getReader(), (e) => got.push(e));
    expect(got).toEqual([{ type: 'item', content: 'Привет' }, { type: 'end', content: 'Привет' }]);
  });
});
