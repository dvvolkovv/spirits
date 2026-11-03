// @vitest-environment jsdom
//
// Бэклог e777aa94: фоновый ход рутины может застать занятую сессию человека
// (релей не вызывается вовсе — RelaySessionBusyError) или сбойный ход
// (пустая генерация). До этой правки «Проверить» в обоих случаях показывала
// «сгенерировали, но пуш не доставлен — включи уведомления», что в случае
// занятой сессии неверно: ничего не сгенерировалось, и совет про push мимо.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mount, flush, visibleText, tRu, byButton, clickAsync, type Mounted } from '../../test/dom';
import RoutinesManager from './RoutinesManager';
import { apiClient } from '../../services/apiClient';

// RoutinesManager (в отличие от ZoomConnectCard) импортирует сам инстанс
// i18n напрямую (для языка в запросе списка ассистентов) — а src/i18n/index.ts
// на загрузке зовёт i18n.use(initReactI18next). Мок без importOriginal
// подменяет весь модуль и роняет эту цепочку ("No initReactI18next export").
vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>();
  const { tRu: t } = await import('../../test/dom');
  return { ...actual, useTranslation: () => ({ t }) };
});

vi.mock('../../services/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const api = vi.mocked(apiClient);
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as any;
const settle = async () => { await flush(); await flush(); };

const ROUTINE = {
  id: 'r1',
  title: 'Энергия дня',
  assistantId: '14',
  prompt: 'Дай энергию дня',
  sendHour: 8,
  tz: 'Europe/Moscow',
  days: null,
  enabled: true,
};

let view: Mounted | null = null;

const render = (): Mounted => {
  view = mount(<RoutinesManager />);
  return view;
};

const clickTest = async (container: HTMLElement) => {
  const btn = byButton(container, new RegExp(tRu('settings.routines.test_button')));
  expect(btn).not.toBeNull();
  await clickAsync(btn!);
  await settle();
};

describe('RoutinesManager — кнопка «Проверить»', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // /webhook/routines отдаёт список рутин, всё остальное (агенты) — пустой
    // список: тест не про имена ассистентов, agentName(id) безопасно падает
    // на `#id`.
    api.get.mockImplementation(async (url: string) =>
      url.includes('/webhook/routines') ? ok({ routines: [ROUTINE] }) : ok([]),
    );
  });

  afterEach(() => {
    view?.unmount();
    view = null;
  });

  it('занятая сессия (busy) — свой текст, а не «пуш не доставлен»', async () => {
    api.post.mockResolvedValue(ok({ ok: true, delivered: 0, busy: true }));
    const { container } = render();
    await settle();
    await clickTest(container);
    expect(visibleText(container)).toContain(tRu('settings.routines.test_busy'));
    expect(visibleText(container)).not.toContain(tRu('settings.routines.test_no_push'));
  });

  it('сбойный ход (failed) — свой текст, а не «пуш не доставлен»', async () => {
    api.post.mockResolvedValue(ok({ ok: true, delivered: 0, failed: true }));
    const { container } = render();
    await settle();
    await clickTest(container);
    expect(visibleText(container)).toContain(tRu('settings.routines.test_failed'));
    expect(visibleText(container)).not.toContain(tRu('settings.routines.test_no_push'));
  });

  it('доставлено — как раньше, test_success', async () => {
    api.post.mockResolvedValue(ok({ ok: true, delivered: 1 }));
    const { container } = render();
    await settle();
    await clickTest(container);
    expect(visibleText(container)).toContain(tRu('settings.routines.test_success'));
  });

  it('не доставлено, без busy/failed — как раньше, test_no_push (пуш не включён на устройстве)', async () => {
    api.post.mockResolvedValue(ok({ ok: true, delivered: 0 }));
    const { container } = render();
    await settle();
    await clickTest(container);
    expect(visibleText(container)).toContain(tRu('settings.routines.test_no_push'));
  });
});
