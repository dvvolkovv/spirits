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
const UserProfileModal = readFileSync(join(__dirname, 'search', 'UserProfileModal.tsx'), 'utf8');
const SearchInterface = readFileSync(join(__dirname, 'search', 'SearchInterface.tsx'), 'utf8');
const CompatibilityInterface = readFileSync(join(__dirname, 'search', 'CompatibilityInterface.tsx'), 'utf8');
const ProfileTasks = readFileSync(join(__dirname, 'profile', 'ProfileTasks.tsx'), 'utf8');
const ProfileView = readFileSync(join(__dirname, 'profile', 'ProfileView.tsx'), 'utf8');
const BusinessCard = readFileSync(join(__dirname, 'profile', 'BusinessCard.tsx'), 'utf8');

/**
 * Классы искомого открывающего тега (найден по data-testid), и только внутри
 * его className — не во всём куске от начала тега до data-testid, куда
 * иначе попали бы соседние комментарии.
 *
 * Границы тега — от своего `<tagName` до ближайшего следующего `>` ПОСЛЕ
 * data-testid, а не до самого data-testid: порядок атрибутов не всегда
 * одинаковый (у search-input, например, data-testid идёт раньше className),
 * и срез только «до data-testid» в таком случае обрезал бы className.
 *
 * «Ближайший следующий `>`» — не первый попавшийся: инлайновые стрелочные
 * обработчики (`onChange={(e) => ...}`) несут свой `>` внутри `=>`, и он
 * почти всегда встречается раньше настоящего конца тега. closingBracket
 * пропускает именно такие `>` (перед которыми стоит `=`) и берёт следующий.
 *
 * Покрыт как простой случай (className="a b c"), так и динамический
 * (className={clsx(...)} / шаблонная строка): классы этой задачи всегда
 * добавляются литералом (см. «Важно» в задаче), поэтому достаточно собрать
 * строковые литералы внутри className={...} и разбить их по пробелам.
 */
function closingBracket(src: string, from: number): number {
  let i = from;
  for (;;) {
    const gt = src.indexOf('>', i);
    if (gt === -1 || src[gt - 1] !== '=') return gt;
    i = gt + 1;
  }
}

function classesOf(src: string, testid: string, tagName: string): string[] {
  const at = src.indexOf(`data-testid="${testid}"`);
  expect(at).toBeGreaterThan(-1);
  const tagStart = src.lastIndexOf(`<${tagName}`, at);
  expect(tagStart).toBeGreaterThan(-1);
  const tagEnd = closingBracket(src, at);
  expect(tagEnd).toBeGreaterThan(-1);
  const tag = src.slice(tagStart, tagEnd);

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

  it('анкета другого человека (UserProfileModal)', () => {
    expect(classesOf(UserProfileModal, 'user-profile-modal', 'div')).toContain('ym-hide-content');
  });

  it('поиск собеседника — область результатов', () => {
    expect(classesOf(SearchInterface, 'search-results', 'div')).toContain('ym-hide-content');
  });

  it('совместимость — добавленные номера', () => {
    expect(classesOf(CompatibilityInterface, 'compatibility-added-numbers', 'div')).toContain('ym-hide-content');
  });

  it('совместимость — результат анализа', () => {
    expect(classesOf(CompatibilityInterface, 'compatibility-result', 'div')).toContain('ym-hide-content');
  });

  it('журнал фоновых задач', () => {
    expect(classesOf(ProfileTasks, 'profile-tasks-list', 'div')).toContain('ym-hide-content');
  });

  it('свой профиль — содержимое анкеты', () => {
    expect(classesOf(ProfileView, 'profile-content', 'div')).toContain('ym-hide-content');
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

  it('поиск людей — строка запроса', () => {
    expect(classesOf(SearchInterface, 'search-input', 'input')).toContain('ym-disable-keys');
  });

  it('совместимость — номер телефона', () => {
    expect(classesOf(CompatibilityInterface, 'compatibility-phone-input', 'input')).toContain('ym-disable-keys');
  });

  it('анкета другого человека — сообщение к запросу контакта', () => {
    expect(classesOf(UserProfileModal, 'user-profile-contact-request-input', 'textarea')).toContain('ym-disable-keys');
  });

  it('анкета другого человека — вступительное сообщение', () => {
    expect(classesOf(UserProfileModal, 'user-profile-intro-input', 'textarea')).toContain('ym-disable-keys');
  });

  it('свой профиль — имя', () => {
    expect(classesOf(ProfileView, 'profile-name-input', 'input')).toContain('ym-disable-keys');
  });

  it('свой профиль — фамилия', () => {
    expect(classesOf(ProfileView, 'profile-lastname-input', 'input')).toContain('ym-disable-keys');
  });

  it('бизнес-карточка — однострочное поле', () => {
    expect(classesOf(BusinessCard, 'business-card-text-input', 'input')).toContain('ym-disable-keys');
  });

  it('бизнес-карточка — многострочное поле', () => {
    expect(classesOf(BusinessCard, 'business-card-multiline-input', 'textarea')).toContain('ym-disable-keys');
  });
});
