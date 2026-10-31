// src/components/chat/markdownPlaceholderWiring.test.ts
//
// Находка ревью пробы 31.10 (с коммита 40198ee): customMarkdown.tsx кладёт в
// карты ключи С префиксом целиком (buttonId = `btn_...`, linkId = `link_...`,
// videoId = `video_...`) — префикс уже внутри id, который попадает и в метку
// __BUTTON_<id>__/__LINK_<id>__/__VIDEO_<id>__. ChatInterface.tsx захватывал
// тот же id из метки и ДОБАВЛЯЛ префикс ЕЩЁ РАЗ (`buttons.get(\`btn_${buttonId}\`)`)
// — двойной префикс не совпадает ни с одним ключом карты, и кнопка/ссылка/
// ролик молча пропадали. images.get(imageId) — без повторного префикса —
// всегда был верным образцом.
//
// Чистая логика (парсинг тегов, карты, компоненты) — в customMarkdown.tsx,
// своя проверка в markdownPlaceholderRender.test.tsx. А то, что оба места
// рендера ChatInterface (StreamingMessage и лента истории) и правда зовут
// .get() по id как есть, видно только здесь — файл слишком большой (3500+
// строк, без собственного рендер-теста), чтобы поднять его целиком. Сторож
// по образцу cabinetLinksWiring.test.ts / interactivityWiring.test.ts.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

describe('разбор меток __BUTTON_/__LINK_/__VIDEO_ в обоих рендерах чата', () => {
  it('buttons.get(id) — по захваченному id как есть, в обоих рендерах (StreamingMessage и лента)', () => {
    expect(SRC.match(/buttons\.get\(buttonId\)/g)?.length).toBe(2);
    expect(SRC).not.toMatch(/buttons\.get\(`btn_\$\{buttonId\}`\)/);
  });

  it('links.get(id) — по захваченному id как есть, в обоих рендерах', () => {
    expect(SRC.match(/links\.get\(linkId\)/g)?.length).toBe(2);
    expect(SRC).not.toMatch(/links\.get\(`link_\$\{linkId\}`\)/);
  });

  it('videos.get(id) — по захваченному id как есть, в обоих рендерах (как уже делал images.get)', () => {
    expect(SRC.match(/videos\.get\(videoId\)/g)?.length).toBe(2);
    expect(SRC).not.toMatch(/videos\.get\(`video_\$\{videoId\}`\)/);
  });

  it('images.get(id) — образец, который не трогали: без префикса, в обоих рендерах', () => {
    expect(SRC.match(/images\.get\(imageId\)/g)?.length).toBe(2);
  });
});
