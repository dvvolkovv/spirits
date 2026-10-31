/**
 * Один TextDecoder на весь поток.
 *
 * Находка ревью пробы 31.10: ChatInterface.tsx (soulmate/chat и
 * agent/upload-and-chat), SearchInterface.tsx, CompatibilityInterface.tsx
 * создавали `new TextDecoder()` на КАЖДЫЙ кусок потока — у такого decoder'а
 * нет памяти о предыдущих байтах, и `{ stream: true }` на нём бесполезен:
 * многобайтный знак (кириллица — 2 байта, большинство эмодзи — 4), разрезанный
 * границей кусков, на половине превращается в «�» (U+FFFD). components/guest/
 * guestStream.ts делает это верно — один decoder на весь поток; этот помощник
 * выносит ту же схему, чтобы её можно было завести в местах, которые целиком
 * не поднять в тесте (ChatInterface.tsx — часть большого компонента).
 */
export interface ChunkDecoder {
  /** Декодирует очередной кусок, помня байтовый хвост предыдущего (`{ stream: true }`). */
  decode: (chunk: Uint8Array) => string;
  /** Забирает то, что decoder придержал как недо-символ. Звать один раз после конца потока. */
  flush: () => string;
}

export function createChunkDecoder(): ChunkDecoder {
  const decoder = new TextDecoder();
  return {
    decode: (chunk: Uint8Array) => decoder.decode(chunk, { stream: true }),
    flush: () => decoder.decode(),
  };
}
