// @vitest-environment jsdom
//
// Карточка бота на вкладке «Telegram-боты». Проверяется видимое: режим голоса
// показан словами из мастера, а не внутренним кодом.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { mount, visibleText, tRu } from '../../test/dom';
import type { Mounted } from '../../test/dom';
import { TgBotCard } from './TgBotCard';
import type { TgBotConfig, VoiceReplyMode } from '../../services/tgBotApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

const bot = (voiceReplyMode: VoiceReplyMode): TgBotConfig => ({
  id: 'b-1',
  tgChatId: '-100123',
  tgChatTitle: 'Семья',
  displayName: 'Финансист',
  presetAgentId: '17',
  customAgentId: null,
  addressingMode: 'strict',
  voiceReplyMode,
  status: 'active',
  lastReplyAt: null,
  createdAt: '2026-10-01T10:00:00Z',
  archivedAt: null,
});

let view: Mounted | null = null;
afterEach(() => {
  view?.unmount();
  view = null;
});

const card = (mode: VoiceReplyMode) => {
  view = mount(
    <TgBotCard config={bot(mode)} onEdit={() => {}} onDelete={() => {}} onMessages={() => {}} />,
  );
  return visibleText(view.container);
};

describe('карточка бота: режим голоса словами', () => {
  it('строка целиком — без сборки ожидания из той же локали', () => {
    // Ожидание из tRu совпало бы с выводом и при пропавшем ключе — оба стали бы
    // сырым ключом. Одна строка задана руками.
    expect(card('never')).toContain('По обращению · голос: Никогда');
  });

  // Было «По обращению · голос: mirror» — код режима прямо в интерфейсе.
  it.each([
    ['never', 'tgBot.voice_never_label'],
    ['mirror', 'tgBot.voice_mirror_label'],
    ['always', 'tgBot.mode_always'],
  ] as const)('%s → подпись из мастера', (mode, labelKey) => {
    const text = card(mode);
    expect(text).toContain(tRu('tgBot.card_mode_voice', { mode: tRu('tgBot.mode_strict'), voice: tRu(labelKey) }));
    expect(text).not.toContain(`: ${mode}`);
  });
});

describe('карточка лички', () => {
  it('вместо «без названия» — «Личный чат с ботом»', () => {
    view = mount(
      <TgBotCard
        config={{ ...bot('mirror'), tgChatId: '987654321', tgChatTitle: null, displayName: 'Linkeon', addressingMode: 'always' }}
        onEdit={() => {}} onDelete={() => {}} onMessages={() => {}}
      />,
    );
    const text = visibleText(view.container);
    expect(text).toContain('Личный чат с ботом');
    expect(text).not.toContain(tRu('tgBot.card_no_title'));
  });
});
