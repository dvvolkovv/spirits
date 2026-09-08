import { describe, it, expect } from 'vitest';
import { consumeTurnStream, StreamEvent } from './ProductChat';

/** Отдаёт заранее заданные куски как настоящий reader. */
function readerOf(chunks: string[]): ReadableStreamDefaultReader<Uint8Array> {
  const enc = new TextEncoder();
  let i = 0;
  return {
    read: async () =>
      i < chunks.length ? { done: false, value: enc.encode(chunks[i++]) } : { done: true, value: undefined },
  } as any;
}

const collect = async (chunks: string[]) => {
  const out: StreamEvent[] = [];
  await consumeTurnStream(readerOf(chunks), (e) => out.push(e));
  return out;
};

describe('consumeTurnStream', () => {
  it('разбирает события по строкам', async () => {
    const out = await collect(['{"type":"begin"}\n{"type":"item","content":"правлю"}\n{"type":"end"}\n']);

    expect(out.map((e) => e.type)).toEqual(['begin', 'item', 'end']);
  });

  it('склеивает событие, разорванное границей чанка', async () => {
    // reader.read() отдаёт куски произвольного размера. Без буфера такое
    // событие теряется целиком, и клиент не увидит часть ответа агента.
    const out = await collect(['{"type":"item","con', 'tent":"правлю футер"}\n']);

    expect(out).toEqual([{ type: 'item', content: 'правлю футер' }]);
  });

  it('не-JSON строка не роняет разбор', async () => {
    const out = await collect(['мусор\n{"type":"end"}\n']);

    expect(out.map((e) => e.type)).toEqual(['end']);
  });

  it('хвост без перевода строки тоже доходит', async () => {
    // Последнее событие может прийти без завершающего \n — тогда оно
    // останется в буфере и пропадёт, а это как раз `end` или `error`.
    const out = await collect(['{"type":"begin"}\n{"type":"end"}']);

    expect(out.map((e) => e.type)).toEqual(['begin', 'end']);
  });

  it('пустые строки пропускаются', async () => {
    const out = await collect(['{"type":"begin"}\n\n\n{"type":"end"}\n']);

    expect(out.map((e) => e.type)).toEqual(['begin', 'end']);
  });
});
