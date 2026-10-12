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
});
