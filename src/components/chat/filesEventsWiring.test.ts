import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Статистика «Медиа и файлы» в админке (spirits_back: chat-files-stats.ts)
 * держится на событиях отсюда: открытие панели и скачивание из неё.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

const body = (marker: string): string => {
  const start = SRC.indexOf(marker);
  expect(start).toBeGreaterThan(-1);
  const from = start + marker.length;
  let depth = 1;
  let i = from;
  while (depth > 0) {
    if (SRC[i] === '{') depth++;
    else if (SRC[i] === '}') depth--;
    i++;
  }
  return SRC.slice(from, i - 1);
};

describe('события панели «Медиа и файлы»', () => {
  it('кнопка в шапке и пункт меню открывают панель через openFilesPanel', () => {
    const toggle = SRC.slice(SRC.indexOf('data-testid="chat-files-toggle"'), SRC.indexOf('data-testid="chat-files-toggle"') + 200);
    const menu = SRC.slice(SRC.indexOf('data-testid="chat-files-menuitem"'), SRC.indexOf('data-testid="chat-files-menuitem"') + 200);
    expect(toggle).toContain("openFilesPanel('header')");
    expect(menu).toContain("openFilesPanel('menu')");
  });

  it('openFilesPanel открывает панель и шлёт chat_files_panel_open', () => {
    const b = body("const openFilesPanel = (entry: 'header' | 'menu') => {");
    expect(b).toContain('setShowFilesPanel(true)');
    expect(b).toMatch(/trackAuthed\('chat_files_panel_open', user\.phone, \{ assistantId: selectedAssistant\.id, fresh: !!freshTs, entry \}\)/);
  });

  it('скачивание из панели шлёт chat_files_download', () => {
    const b = body("const trackFilesDownload = (kind: ChatFileKind, from: 'list' | 'viewer') => {");
    expect(b).toContain("trackAuthed('chat_files_download', user.phone, { kind, from })");
    expect(SRC).toContain('onDownload={trackFilesDownload}');
  });

  // Картинка-вложение в ленте (ChatImageAttachment, рисуется в markdownComponents.a)
  // — тот же chat_files_download, что шлёт панель. from: 'feed' — метка для
  // разбора по отдельным событиям, а не для сводной цифры: «Скачиваний» в
  // админке считает по kind и включает оба источника вместе, не разделяя их.
  it('скачивание картинки-вложения в ленте шлёт chat_files_download с from: feed', () => {
    const b = body('const trackFeedImageDownload = useCallback(() => {');
    expect(b).toContain('userPhoneRef.current');
    expect(b).toContain("trackAuthed('chat_files_download', phone, { kind: 'image', from: 'feed' })");
    expect(SRC).toContain('onDownload={trackFeedImageDownload}');
  });

  // Ревью E3 (02.11): markdownComponents ниже — useMemo с единственной
  // зависимостью handleLinkNavigation, пересоздаётся редко (баланс токенов
  // поллится раз в 5 с и давал бы новый user на каждый тик — без этого
  // памятка пересобирала бы всю разметку ленты на каждый тик). Если
  // trackFeedImageDownload замыкает user НАПРЯМУЮ, то памятка, захваченная
  // ОДИН раз (на первом рендере, где markdownComponents ещё пересобран),
  // держит user именно ТОГО рендера навечно: вход через OAuth/Taler ID/
  // привязку аккаунта (login('', …)) получает телефон позже первого
  // рендера — скачивания из ленты молчали бы весь первый сеанс. Ref
  // обновляется на каждый рендер независимо от памятки — его .current
  // всегда свежий на момент клика, а не на момент создания замыкания.
  it('trackFeedImageDownload — useCallback с пустыми зависимостями, телефон из ref (не из user напрямую)', () => {
    expect(SRC).toMatch(/const userPhoneRef = useRef\(user\?\.phone\);\s*\n\s*userPhoneRef\.current = user\?\.phone;/);
    expect(SRC).toMatch(/const trackFeedImageDownload = useCallback\(\(\) => \{[\s\S]*?\}, \[\]\);/);
  });
});
