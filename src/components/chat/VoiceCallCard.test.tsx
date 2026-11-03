// src/components/chat/VoiceCallCard.test.tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, clickAsync, flush, visibleText } from '../../test/dom';
import { apiClient } from '../../services/apiClient';
import VoiceCallCard from './VoiceCallCard';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

vi.mock('../../services/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const details = (extra: Record<string, unknown> = {}) => ({
  ok: true,
  json: async () => ({
    duration_sec: 1800,
    status: 'completed',
    transcript: [{ role: 'user', text: 'начнём', ts: 1 }],
    ...extra,
  }),
});

const open = async () => {
  const view = mount(<VoiceCallCard callId="call-1" />);
  await clickAsync(view.container.querySelector('[data-testid="voice-call-card"]')!);
  await flush();
  return view.container;
};

/** Владелец 03.11.2026: «на встречах записывать список участников». */
describe('карточка встречи: участники', () => {
  beforeEach(() => vi.mocked(apiClient.get).mockReset());

  it('показывает каждого участника со временем входа', async () => {
    const at = new Date(2026, 10, 3, 14, 5).getTime();
    vi.mocked(apiClient.get).mockResolvedValue(details({
      participants: [{ name: 'Аня', joinedAt: at }, { name: 'Борис', joinedAt: at + 60_000 }],
    }) as any);
    const c = await open();

    const list = c.querySelector('[data-testid="voice-call-participants"]')!;
    expect(list).not.toBeNull();
    const text = visibleText(list as HTMLElement);
    expect(text).toContain('Участники');
    expect(text).toContain('Аня');
    expect(text).toContain('14:05');
    expect(text).toContain('Борис');
    expect(text).toContain('14:06');
  });

  it('у звонка без участников блока нет', async () => {
    vi.mocked(apiClient.get).mockResolvedValue(details({ participants: null }) as any);
    const c = await open();
    expect(visibleText(c)).toContain('начнём');
    expect(c.querySelector('[data-testid="voice-call-participants"]')).toBeNull();
  });
});
