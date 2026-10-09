// src/components/webvisorPrivacy.test.ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Вебвизор Яндекс Метрики кабинета (счётчик 105897773, webvisor:true в
 * index.html) по умолчанию записывает страницу целиком — без этих классов в
 * записи виден весь текст переписки с ассистентами, с людьми, с поддержкой и
 * набираемые сообщения (решение владельца 09.10.2026). Справка Метрики
 * «Session Replay»:
 *  - ym-hide-content на контейнере — он и всё вложенное не попадает в запись;
 *  - ym-disable-keys на поле ввода — набираемый текст заменяется звёздочками.
 *
 * Сторож читает исходники и для каждого data-testid проверяет, что нужный
 * класс стоит именно в className="…" ЕГО открывающего тега — а не где-то в
 * куске тега вообще: рядом бывают поясняющие комментарии с тем же словом
 * (сам этот приём уже используется у chat-input, см. ниже), и наивный поиск
 * по всему тегу не заметил бы, что класс на самом деле отсутствует в
 * className или уехал в комментарий.
 */

const ChatInterface = readFileSync(join(__dirname, 'chat', 'ChatInterface.tsx'), 'utf8');
const ChatFilesPanel = readFileSync(join(__dirname, 'chat', 'files', 'ChatFilesPanel.tsx'), 'utf8');
const MediaViewer = readFileSync(join(__dirname, 'chat', 'files', 'MediaViewer.tsx'), 'utf8');
const ChatConversationView = readFileSync(join(__dirname, 'chats', 'ChatConversationView.tsx'), 'utf8');
const PeerInboxPanels = readFileSync(join(__dirname, 'peer', 'PeerInboxPanels.tsx'), 'utf8');
const SupportView = readFileSync(join(__dirname, 'support', 'SupportView.tsx'), 'utf8');
const TgBotMessagesView = readFileSync(join(__dirname, 'tg-bot', 'TgBotMessagesView.tsx'), 'utf8');

/**
 * Классы искомого открывающего тега (найден по data-testid), и только внутри
 * его className — не во всём куске от начала тега до data-testid, куда
 * иначе попали бы соседние комментарии.
 *
 * Покрыт как простой случай (className="a b c"), так и динамический
 * (className={clsx(...)} / шаблонная строка): классы этой задачи всегда
 * добавляются литералом (см. «Важно» в задаче), поэтому достаточно собрать
 * строковые литералы внутри className={...} и разбить их по пробелам.
 */
function classesOf(src: string, testid: string, tagName: string): string[] {
  const at = src.indexOf(`data-testid="${testid}"`);
  expect(at).toBeGreaterThan(-1);
  const tagStart = src.lastIndexOf(`<${tagName}`, at);
  expect(tagStart).toBeGreaterThan(-1);
  const tag = src.slice(tagStart, at);

  const plain = tag.match(/className="([^"]*)"/);
  if (plain) return plain[1].split(/\s+/).filter(Boolean);

  const dynamic = tag.match(/className=\{([\s\S]*?)\}/);
  if (!dynamic) return [];
  return [...dynamic[1].matchAll(/['"`]([^'"`]*)['"`]/g)].flatMap((m) => m[1].split(/\s+/)).filter(Boolean);
}

describe('переписка скрыта от записи Вебвизора (ym-hide-content)', () => {
  it('чат с ассистентом — лента сообщений', () => {
    expect(classesOf(ChatInterface, 'chat-messages-list', 'div')).toContain('ym-hide-content');
  });

  it('«Медиа и файлы» — панель', () => {
    expect(classesOf(ChatFilesPanel, 'chat-files-panel', 'div')).toContain('ym-hide-content');
  });

  it('просмотр файла', () => {
    expect(classesOf(MediaViewer, 'media-viewer', 'div')).toContain('ym-hide-content');
  });

  it('переписка с человеком — лента', () => {
    expect(classesOf(ChatConversationView, 'peer-messages-list', 'div')).toContain('ym-hide-content');
  });

  it('переписка с человеком — имя и аватар в шапке', () => {
    expect(classesOf(ChatConversationView, 'peer-chat-header-identity', 'div')).toContain('ym-hide-content');
  });

  it('список переписок — превью сообщений (ConversationsList)', () => {
    expect(classesOf(PeerInboxPanels, 'peer-conversations-list', 'div')).toContain('ym-hide-content');
  });

  it('запросы на знакомство (RequestsPanel)', () => {
    expect(classesOf(PeerInboxPanels, 'peer-requests-panel', 'div')).toContain('ym-hide-content');
  });

  it('поддержка — переписка', () => {
    expect(classesOf(SupportView, 'support-messages-list', 'div')).toContain('ym-hide-content');
  });

  it('история Telegram-бота', () => {
    expect(classesOf(TgBotMessagesView, 'tg-bot-messages-list', 'div')).toContain('ym-hide-content');
  });
});

describe('поля ввода сообщений скрыты от записи Вебвизора (ym-disable-keys)', () => {
  // Уже стоит — сторож см. src/components/chat/draftWiring.test.ts. Проверяем
  // здесь же, чтобы вся таблица задачи была видна одним файлом.
  it('чат с ассистентом — поле ввода', () => {
    expect(classesOf(ChatInterface, 'chat-input', 'textarea')).toContain('ym-disable-keys');
  });

  it('переписка с человеком — текст жалобы', () => {
    expect(classesOf(ChatConversationView, 'peer-report-reason-input', 'textarea')).toContain('ym-disable-keys');
  });

  it('переписка с человеком — поле сообщения', () => {
    expect(classesOf(ChatConversationView, 'peer-message-input', 'textarea')).toContain('ym-disable-keys');
  });

  it('поддержка — поле сообщения', () => {
    expect(classesOf(SupportView, 'support-message-input', 'textarea')).toContain('ym-disable-keys');
  });
});
