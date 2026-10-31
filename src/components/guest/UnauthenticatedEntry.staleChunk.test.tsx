// src/components/guest/UnauthenticatedEntry.staleChunk.test.tsx
// @vitest-environment jsdom
//
// C2 (Critical, ревью качества B9-fix): протухший index.html после выката
// (старый хеш чанка в закэшированной странице у человека) делает
// динамический import() ленивого GuestChatPage отклонённым промисом — без
// обработки это необработанное исключение внутри React.lazy и белый экран
// на самом массовом входе сайта.
//
// Свой файл, а не новый it() в UnauthenticatedEntry.test.tsx: React.lazy
// запоминает результат ПЕРВОГО вызова загрузчика навсегда, а Vitest изолирует
// модульный граф каждого тестового файла — тест с ДРУГИМ поведением того же
// './GuestChatPage' (рендер-крэш — UnauthenticatedEntry.renderCrash.test.tsx)
// не может жить в одном файле с этим без resetModules() и риска рассинхрона
// экземпляра React между модульными графами.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { flush, mount, visibleText, type Mounted } from '../../test/dom';

vi.mock('../../pages/OnboardingPage', () => ({ default: () => <div>экран входа</div> }));
vi.mock('./guestApi', () => ({
  fetchGuestConfig: vi.fn(async () => ({ mode: 'on', answersPerTrial: 3, maxChars: 2000 })),
}));
// Протухший чанк: import() этого модуля отклоняется — так выглядит для
// браузера старый хеш в закэшированном index.html после выката.
vi.mock('./GuestChatPage', () => {
  throw new Error('ChunkLoadError: протухший хеш чанка');
});

import UnauthenticatedEntry from './UnauthenticatedEntry';

let view: Mounted | null = null;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  delete (window as any).Capacitor;
});
afterEach(() => { view?.unmount(); view = null; });

describe('C2: сбой ленивого чанка пробы', () => {
  it('import() отклонён — тихий откат на экран входа, а не белый экран', async () => {
    view = mount(<MemoryRouter initialEntries={['/chat']}><UnauthenticatedEntry /></MemoryRouter>);
    for (let i = 0; i < 8; i++) await flush();
    expect(visibleText(view.container)).toContain('экран входа');
  });
});
