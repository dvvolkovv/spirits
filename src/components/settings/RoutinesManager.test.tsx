// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { byButton, clickAsync, flush, mount, tRu, visibleText, type Mounted } from '../../test/dom';
import RoutinesManager from './RoutinesManager';
import { apiClient } from '../../services/apiClient';

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const { tRu: t } = await import('../../test/dom');
  return { ...actual, useTranslation: () => ({ t }) };
});
vi.mock('../../services/apiClient', () => ({ apiClient: { get: vi.fn(), post: vi.fn() } }));

const api = vi.mocked(apiClient);
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as any;
const ROUTINE = { id: 'r1', title: 'Энергия дня', assistantId: '14', prompt: 'Дай энергию дня', sendHour: 8, tz: 'Europe/Moscow', days: null, enabled: true };
let view: Mounted | null = null;
const settle = async () => { await flush(); await flush(); };
const render = () => { view = mount(<RoutinesManager />); return view; };
const clickTest = async (container: HTMLElement) => {
  const button = byButton(container, new RegExp(tRu('settings.routines.test_button')));
  expect(button).not.toBeNull();
  await clickAsync(button!);
  await settle();
};

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockImplementation((url: string) => Promise.resolve(ok(
    url === '/webhook/routines' ? { routines: [ROUTINE] } : [],
  )));
});
afterEach(() => { view?.unmount(); view = null; });

describe('ручная проверка рутины', () => {
  it('показывает busy без совета включить push', async () => {
    api.post.mockResolvedValue(ok({ ok: true, delivered: 0, busy: true }));
    const { container } = render();
    await settle();
    await clickTest(container);
    expect(visibleText(container)).toContain('Ассистент сейчас занят — попробуй через минуту.');
    expect(visibleText(container)).not.toContain('Сгенерировали, но пуш не доставлен');
  });

  it('показывает failed без совета включить push', async () => {
    api.post.mockResolvedValue(ok({ ok: true, delivered: 0, failed: true }));
    const { container } = render();
    await settle();
    await clickTest(container);
    expect(visibleText(container)).toContain('Не получилось подготовить сообщение — попробуй ещё раз чуть позже.');
    expect(visibleText(container)).not.toContain('Включи уведомления');
  });

  it('сохраняет сообщение об успешной доставке', async () => {
    api.post.mockResolvedValue(ok({ ok: true, delivered: 1 }));
    const { container } = render();
    await settle();
    await clickTest(container);
    expect(visibleText(container)).toContain('Отправили — проверь уведомление 🔔');
  });

  it('сохраняет сообщение о недоставленном пуше без новых флагов', async () => {
    api.post.mockResolvedValue(ok({ ok: true, delivered: 0 }));
    const { container } = render();
    await settle();
    await clickTest(container);
    expect(visibleText(container)).toContain(tRu('settings.routines.test_no_push'));
  });
});
