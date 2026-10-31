// src/utils/streamDecoderWiring.test.ts
//
// Чистая логика decoder'а — в streamDecoder.ts (свои тесты). Но то, что
// реальные потребители и правда заводят ОДИН decoder на поток через
// createChunkDecoder, а не `new TextDecoder()` на каждый кусок (находка
// ревью пробы 31.10 — «�» на границе кусков), видно только здесь: сами файлы
// слишком большие (ChatInterface.tsx) или без собственного рендер-теста
// (SearchInterface.tsx, CompatibilityInterface.tsx), чтобы поднять поток в
// тесте целиком. Сторож по образцу cabinetLinksWiring.test.ts /
// interactivityWiring.test.ts (components/chat).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const FILES = {
  chat: join(__dirname, '../components/chat/ChatInterface.tsx'),
  search: join(__dirname, '../components/search/SearchInterface.tsx'),
  compatibility: join(__dirname, '../components/search/CompatibilityInterface.tsx'),
};

describe('потоки чата/поиска/совместимости используют общий createChunkDecoder', () => {
  it.each(Object.entries(FILES))('%s: импортирует createChunkDecoder из utils/streamDecoder', (_name, path) => {
    const src = readFileSync(path, 'utf8');
    expect(src).toMatch(/import\s*\{[^}]*createChunkDecoder[^}]*\}\s*from\s*['"][^'"]*utils\/streamDecoder['"]/);
  });

  it.each(Object.entries(FILES))('%s: ни одного `new TextDecoder()` на кусок — decoder один на поток', (_name, path) => {
    const src = readFileSync(path, 'utf8');
    expect(src).not.toContain('new TextDecoder()');
  });

  it('ChatInterface.tsx: оба потока (soulmate/chat и agent/upload-and-chat) заводят decoder до цикла чтения', () => {
    const src = readFileSync(FILES.chat, 'utf8');
    // Ровно два потоковых чтения, ровно два decoder'а — по одному на каждое.
    expect(src.match(/createChunkDecoder\(\)/g)?.length).toBe(2);
  });
});
