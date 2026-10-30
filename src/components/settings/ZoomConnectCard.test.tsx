// @vitest-environment jsdom
//
// Подключение Zoom — единственное место, где человек даёт согласие, без
// которого ассистент заперт во встречах нашего аккаунта. Поэтому проверяем не
// вёрстку, а поведение: уводим ли браузер к Zoom, показываем ли подключённое
// состояние и не остаётся ли на экране вчерашнее сообщение об исходе.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BrowserRouter, useLocation } from 'react-router-dom';
import { mount, flush, visibleText, tRu, byButton, clickAsync, type Mounted } from '../../test/dom';
import ZoomConnectCard from './ZoomConnectCard';
import { apiClient } from '../../services/apiClient';

// Экран-свидетель: какой адрес видит роутер (по нему профиль решает, что раскрыть).
const Where = () => {
  const l = useLocation();
  return <div data-where>{`${l.pathname}${l.search}`}</div>;
};

let view: Mounted | null = null;

// Карточка живёт в кабинете, то есть под роутером браузера — как в App.tsx.
const card = (): Mounted => {
  view = mount(
    <BrowserRouter>
      <ZoomConnectCard />
      <Where />
    </BrowserRouter>,
  );
  return view;
};

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t }) };
});

vi.mock('../../services/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));

const api = vi.mocked(apiClient);
const ok = (body: unknown) => ({ ok: true, json: async () => body }) as any;
const settle = async () => { await flush(); await flush(); };

describe('подключение Zoom', () => {
  // Подмена window.location обязана жить ровно один тест: иначе соседние
  // читают её вместо настоящего адреса, и падает не тот, кто сломан.
  const realLocation = Object.getOwnPropertyDescriptor(window, 'location')!;

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({}, '', '/settings');
  });
  afterEach(() => {
    view?.unmount();
    view = null;
    Object.defineProperty(window, 'location', realLocation);
  });

  it('подключённый аккаунт показывает как подключённый', async () => {
    api.get.mockResolvedValue(ok({ connected: true }));
    const { container } = card();
    await settle();
    expect(visibleText(container)).toContain(tRu('settings.zoom.connected'));
  });

  it('по кнопке уводит браузер на согласие Zoom', async () => {
    api.get.mockResolvedValue(ok({ connected: false }));
    api.post.mockResolvedValue(ok({ authorizeUrl: 'https://zoom.us/oauth/authorize?x=1' }));
    const { container } = card();
    await settle();

    // jsdom не умеет переходить по адресу — подменяем присваивание.
    const href = vi.fn();
    Object.defineProperty(window, 'location', {
      value: { ...window.location, search: '', pathname: '/settings', set href(v: string) { href(v); } },
      writable: true,
    });

    await clickAsync(byButton(container, new RegExp(tRu('settings.zoom.connect')))!);
    await settle();
    expect(href).toHaveBeenCalledWith('https://zoom.us/oauth/authorize?x=1');
  });

  it('отказ от подключения объясняет, а пометку из адреса убирает', async () => {
    // Иначе, перезагрузив страницу, человек снова увидит вчерашнее сообщение.
    window.history.replaceState({}, '', '/settings?zoom_connect=denied');
    api.get.mockResolvedValue(ok({ connected: false }));
    const { container } = card();
    await settle();
    expect(visibleText(container)).toContain(tRu('settings.zoom.denied'));
    expect(window.location.search).toBe('');
  });

  it('успешный возврат ничего не объясняет — и так видно', async () => {
    window.history.replaceState({}, '', '/settings?zoom_connect=ok');
    api.get.mockResolvedValue(ok({ connected: true }));
    const { container } = card();
    await settle();
    expect(visibleText(container)).toContain(tRu('settings.zoom.connected'));
    expect(window.location.search).toBe('');
  });

  // Находка ревью бэка: пометку снимали history.replaceState({}, …) мимо
  // роутера. Роутер продолжал видеть адрес с пометкой, а состояние истории
  // (ключ и номер записи роутера) затиралось пустым объектом. Возврат от Zoom
  // теперь идёт на /profile?open=zoom&zoom_connect=… — карточка, к которой
  // прокручивает профиль, должна остаться в адресе.
  it('пометку снимает переходом роутера: остальные параметры на месте, роутер видит чистый адрес', async () => {
    window.history.replaceState({}, '', '/profile?open=zoom&zoom_connect=denied&utm_source=kb');
    api.get.mockResolvedValue(ok({ connected: false }));
    const { container } = card();
    await settle();
    expect(visibleText(container)).toContain(tRu('settings.zoom.denied'));
    expect(container.querySelector('[data-where]')?.textContent).toBe('/profile?open=zoom&utm_source=kb');
    expect(`${window.location.pathname}${window.location.search}`).toBe('/profile?open=zoom&utm_source=kb');
    expect(window.history.state).toMatchObject({ idx: expect.any(Number), key: expect.any(String) });
  });
});
