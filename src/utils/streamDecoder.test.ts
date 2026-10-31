// Находка ревью пробы 31.10: `new TextDecoder()` на каждый кусок потока
// (вместо одного decoder'а на весь поток) режет многобайтные знаки,
// разрезанные границей кусков, превращая их в «�». По образцу
// components/guest/guestStream.test.ts ("многобайтный знак на границе
// кусков не ломается"), но для общего помощника createChunkDecoder,
// который заводится там, где весь путь потока поднять в тесте не удаётся
// (ChatInterface.tsx — часть большого компонента без собственного рендер-теста).
import { describe, expect, it } from 'vitest';
import { createChunkDecoder } from './streamDecoder';

describe('createChunkDecoder', () => {
  it('кириллица (2 байта), разрезанная границей кусков, не превращается в replacement character', () => {
    const bytes = new TextEncoder().encode('Привет, мир!');
    const cut = 3; // посреди первой буквы «П» (2 байта в UTF-8)
    const decoder = createChunkDecoder();
    const text = decoder.decode(bytes.slice(0, cut)) + decoder.decode(bytes.slice(cut)) + decoder.flush();
    expect(text).toBe('Привет, мир!');
    expect(text).not.toContain('�');
  });

  it('эмодзи (4 байта), разрезанное границей кусков, не ломается', () => {
    const bytes = new TextEncoder().encode('Готово ✅🎉');
    const cut = bytes.length - 3; // посреди последнего эмодзи
    const decoder = createChunkDecoder();
    const text = decoder.decode(bytes.slice(0, cut)) + decoder.decode(bytes.slice(cut)) + decoder.flush();
    expect(text).toBe('Готово ✅🎉');
    expect(text).not.toContain('�');
  });

  it('кусок разрезан на каждом байте — весь текст собирается без потерь', () => {
    const bytes = new TextEncoder().encode('Строка для разбора по одному байту 🚀');
    const decoder = createChunkDecoder();
    let text = '';
    for (let i = 0; i < bytes.length; i++) {
      text += decoder.decode(bytes.slice(i, i + 1));
    }
    text += decoder.flush();
    expect(text).toBe('Строка для разбора по одному байту 🚀');
  });

  it('цельный кусок без разреза декодируется как обычно', () => {
    const decoder = createChunkDecoder();
    expect(decoder.decode(new TextEncoder().encode('ok'))).toBe('ok');
  });

  it('новый decoder на каждый кусок (старое поведение) — контроль: именно так получалась «�»', () => {
    const bytes = new TextEncoder().encode('Привет');
    const cut = 3;
    // Старый баг: `new TextDecoder().decode(value)` без `stream` и с новым
    // decoder'ом на каждый вызов — ни памяти о хвосте, ни разрешения на то,
    // что строка не закончена.
    const broken = new TextDecoder().decode(bytes.slice(0, cut)) + new TextDecoder().decode(bytes.slice(cut));
    expect(broken).toContain('�');
    expect(broken).not.toBe('Привет');
  });
});
