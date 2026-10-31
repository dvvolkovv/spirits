// src/components/guest/UnauthenticatedEntry.renderCrash.test.tsx
// @vitest-environment jsdom
//
// C2 (Critical, ревью качества B9-fix): ошибка РЕНДЕРА внутри самой пробы
// (не сбой загрузки чанка — исключение в самом компоненте) должна откатывать
// на экран входа через собственную границу ошибок пробы (GuestTrialBoundary),
// а не всплывать до общего ErrorBoundary кабинета (components/ErrorBoundary.tsx),
// который рисует технический экран со стеком — гостю на первом экране сайта
// он ни к чему и только пугает.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { flush, mount, visibleText, type Mounted } from '../../test/dom';

vi.mock('../../pages/OnboardingPage', () => ({ default: () => <div>экран входа</div> }));
vi.mock('./guestApi', () => ({
  fetchGuestConfig: vi.fn(async () => ({ mode: 'on', answersPerTrial: 3, maxChars: 2000 })),
}));
vi.mock('./GuestChatPage', () => ({
  default: () => { throw new Error('бум — сбой внутри пробы'); },
}));

import UnauthenticatedEntry from './UnauthenticatedEntry';

let view: Mounted | null = null;
let consoleErrorSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete (window as any).Capacitor;
  // componentDidCatch сам пишет в консоль (ожидаемо) — глушим, чтобы отчёт
  // прогона не пестрил «ошибками», которые на самом деле проверка теста.
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  view?.unmount();
  view = null;
  consoleErrorSpy.mockRestore();
});

describe('C2: сбой рендера внутри пробы', () => {
  it('GuestChatPage бросает при рендере — экран входа, а не белый экран', async () => {
    view = mount(<MemoryRouter initialEntries={['/chat']}><UnauthenticatedEntry /></MemoryRouter>);
    for (let i = 0; i < 8; i++) await flush();
    expect(visibleText(view.container)).toContain('экран входа');
  });
});
