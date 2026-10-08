import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Сторож связки панели «Медиа и файлы». Панель и её части покрыты своими
 * тестами, а вот что ChatInterface её вообще открывает — видно только здесь.
 */
const SRC = readFileSync(join(__dirname, 'ChatInterface.tsx'), 'utf8');

describe('связка панели «Медиа и файлы»', () => {
  it('панель получает открытого ассистента и метку «Чистого листа»', () => {
    expect(SRC).toContain("import ChatFilesPanel from './files/ChatFilesPanel';");
    const at = SRC.indexOf('<ChatFilesPanel');
    expect(at).toBeGreaterThan(-1);
    const tag = SRC.slice(at, SRC.indexOf('/>', at));
    expect(tag).toContain('assistantId={selectedAssistant.id}');
    expect(tag).toContain('freshTs={freshTs}');
    expect(tag).toContain('onClose={() => setShowFilesPanel(false)}');
    expect(SRC.slice(at - 120, at)).toContain('showFilesPanel && selectedAssistant && (');
  });

  it('на мобиле — первый пункт меню «⋯»', () => {
    const menu = SRC.indexOf('role="menu"');
    const item = SRC.indexOf('data-testid="chat-files-menuitem"', menu);
    const fresh = SRC.indexOf('toggleFreshMode(); }}', menu);
    expect(item).toBeGreaterThan(menu);
    expect(item).toBeLessThan(fresh);
    expect(SRC.slice(item, item + 400)).toContain('setShowChatActions(false); setShowFilesPanel(true);');
  });

  it('на десктопе — кнопка в ряду перед «Перегенерировать»', () => {
    const btn = SRC.indexOf('data-testid="chat-files-toggle"');
    const regen = SRC.indexOf('onClick={handleRegenerateResponse}', btn);
    expect(btn).toBeGreaterThan(-1);
    expect(regen).toBeGreaterThan(btn);
    expect(SRC.slice(btn, regen)).toContain('hidden sm:block');
    expect(SRC.slice(btn, regen)).toContain('onClick={() => setShowFilesPanel(true)}');
  });

  it('смена ассистента закрывает панель', () => {
    expect(SRC).toMatch(/useEffect\(\(\) => \{\s*setShowFilesPanel\(false\);\s*\}, \[selectedAssistant\?\.id\]\)/);
  });
});
