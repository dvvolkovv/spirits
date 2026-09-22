// @vitest-environment jsdom
//
// Плашка встречи — единственное место, где человек узнаёт, дошёл ли ассистент.
// Успешный ответ на «зайти» ничего не обещает: бот идёт на встречу секунды и
// минуты, и сорваться может уже после ответа. Прежняя редакция показывала
// «ассистент на встрече» в любом случае, и человек ждал того, кто не придёт
// (замечание владельца 22.09.2026). Поэтому тесты смотрят на то, что видно на
// экране.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flush, visibleText, tRu } from '../../test/dom';
import MeetingStatusBar from './MeetingStatusBar';
import { apiClient } from '../../services/apiClient';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

vi.mock('../../services/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const api = vi.mocked(apiClient);

const answer = (status: string) =>
  ({ ok: true, json: async () => ({ status }) }) as any;

/** Дать промисам компонента доехать: опрос состояния асинхронный. */
const settle = async () => { await flush(); await flush(); };

describe('плашка встречи', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.post.mockResolvedValue({ ok: true, json: async () => ({}) } as any);
  });
  afterEach(() => vi.useRealTimers());

  it('пока встреча идёт, показывает её и кнопку выхода', async () => {
    api.get.mockResolvedValue(answer('active'));
    const { container } = mount(<MeetingStatusBar callId="c1" onLeft={() => {}} />);
    await settle();
    expect(visibleText(container)).toContain(tRu('chat.meeting.in_progress'));
    expect(visibleText(container)).not.toContain(tRu('chat.meeting.join_failed'));
  });

  it('если вход сорвался, говорит об этом прямо', async () => {
    api.get.mockResolvedValue(answer('failed'));
    const { container } = mount(<MeetingStatusBar callId="c1" onLeft={() => {}} />);
    await settle();
    expect(visibleText(container)).toContain(tRu('chat.meeting.join_failed'));
    // Звать к выходу с несостоявшейся встречи незачем.
    expect(visibleText(container)).not.toContain(tRu('chat.meeting.in_progress'));
  });

  it('неудачная проверка не выдаёт себя за отказ входа', async () => {
    // Сеть моргнула — это наша беда, а не встречи. Пугать человека «зайти не
    // получится» из-за собственной неудачной проверки нельзя.
    api.get.mockRejectedValue(new Error('network'));
    const { container } = mount(<MeetingStatusBar callId="c1" onLeft={() => {}} />);
    await settle();
    expect(visibleText(container)).toContain(tRu('chat.meeting.in_progress'));
  });

  it('спрашивает состояние того звонка, который показывает', async () => {
    api.get.mockResolvedValue(answer('active'));
    mount(<MeetingStatusBar callId="abc-123" onLeft={() => {}} />);
    await settle();
    expect(String(api.get.mock.calls[0][0])).toContain('/webhook/meeting/abc-123/status');
  });
});
