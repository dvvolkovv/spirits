// Ревью E2 (31.10): до этой правки SearchInterface.tsx рвал цикл на `done`
// БЕЗ разбора остатка lineBuffer — последняя строка без завершающего \n
// (так часто приходит закрывающее событие хода) терялась молча. По образцу
// products/productChatStream.test.ts (сама функция — products/ProductChat.tsx:
// consumeTurnStream) — вынесено из компонента, чтобы поведение потока можно
// было проверить без рендера всего экрана поиска.
import { describe, it, expect } from 'vitest';
import { consumeSearchStream } from './SearchInterface';

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
  const out: string[] = [];
  await consumeSearchStream(readerOf(chunks), (content) => out.push(content));
  return out;
};

describe('consumeSearchStream', () => {
  it('разбирает item-события по строкам', async () => {
    const out = await collect(['{"type":"item","content":"a"}\n{"type":"item","content":"b"}\n']);
    expect(out).toEqual(['a', 'b']);
  });

  it('склеивает событие, разорванное границей чанка — многобайтный знак не ломается', async () => {
    const out = await collect(['{"type":"item","con', 'tent":"Привет"}\n']);
    expect(out).toEqual(['Привет']);
  });

  it('хвост без перевода строки тоже доходит (ревью E2 31.10): done не должен терять последнюю строку', async () => {
    const out = await collect(['{"type":"item","content":"a"}\n{"type":"item","content":"b"}']);
    expect(out).toEqual(['a', 'b']);
  });

  it('не-JSON строка не роняет разбор остального потока', async () => {
    const out = await collect(['мусор\n{"type":"item","content":"c"}\n']);
    expect(out).toEqual(['c']);
  });

  it('пустые строки пропускаются', async () => {
    const out = await collect(['{"type":"item","content":"a"}\n\n\n{"type":"item","content":"b"}\n']);
    expect(out).toEqual(['a', 'b']);
  });
});
