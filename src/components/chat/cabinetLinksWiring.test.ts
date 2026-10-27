// src/components/chat/cabinetLinksWiring.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож проводки ChatInterface: чистая логика — в utils/cabinetSections.ts
 * (свои тесты), а что чат её зовёт, видно только здесь. Уберёшь вызов — и
 * ссылки ассистента на разделы снова уйдут в новую вкладку (в приложении —
 * во внешний браузер без входа), а тесты модуля останутся зелёными.
 * Через handleLinkNavigation идут все три вида ссылок в ответе: {{link}},
 * markdown-ссылка и голый https (remark-gfm делает из него <a>).
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const between = (from: string, to: string): string => {
  const a = SRC.indexOf(from);
  expect(a).toBeGreaterThan(-1);
  const b = SRC.indexOf(to, a);
  expect(b).toBeGreaterThan(a);
  return SRC.slice(a, b);
};

describe('ссылки чата на свой кабинет', () => {
  // Находка ревью (M5): прежняя проверка «вызов стоит до window.open»
  // зеленела и с navigate(url) вместо navigate(inside), и без return — а тогда
  // своя ссылка открылась бы и в этой вкладке, и в новой. Поэтому обработчик
  // сверяется целиком, без комментариев и с точностью до пробелов. Куда вести
  // ссылку, решает chatLinkPath (свои тесты в utils/cabinetSections.test.ts).
  it('путь кабинета — переходом роутера и только им, остальное — новая вкладка без доступа к нашей', () => {
    const code = between('const handleLinkNavigation = useCallback', '}, [navigate]);')
      .replace(/\/\/.*$/gm, '')
      .replace(/\s+/g, ' ')
      .trim();
    expect(code).toBe(
      'const handleLinkNavigation = useCallback((url: string) => {' +
        ' const inside = chatLinkPath(url);' +
        ' if (inside) { navigate(inside); return; }' +
        " window.open(url, '_blank', 'noopener,noreferrer');",
    );
  });

  it('кнопка «Настройки» ведёт в раскрытые настройки профиля', () => {
    const body = between('const handleButtonAction = useCallback', '}, [navigate]);');
    expect(body).toMatch(/case 'settings':\s*navigate\('\/profile\?settings=1'\);/);
    expect(body).not.toContain("navigate('/settings')");
  });

  it('markdown-ссылка и {{link}} — через тот же обработчик', () => {
    expect(SRC).toContain('if (href) handleLinkNavigation(href);');
    expect(SRC).toContain('createLinkComponent(linkConfig, handleLinkNavigation)');
  });
});
