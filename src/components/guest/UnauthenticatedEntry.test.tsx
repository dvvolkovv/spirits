// src/components/guest/UnauthenticatedEntry.test.tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { flush, mount, visibleText, type Mounted } from '../../test/dom';

vi.mock('../../pages/OnboardingPage', () => ({ default: () => <div>экран входа</div> }));
vi.mock('./GuestChatPage', () => ({ default: (p: any) => <div>проба:{p.config.mode}:{String(p.preview)}</div> }));
vi.mock('./guestApi', () => ({ fetchGuestConfig: vi.fn() }));

import { fetchGuestConfig } from './guestApi';
import UnauthenticatedEntry from './UnauthenticatedEntry';

const config = fetchGuestConfig as unknown as ReturnType<typeof vi.fn>;
let view: Mounted | null = null;
async function open(url: string) {
  view = mount(<MemoryRouter initialEntries={[url]}><UnauthenticatedEntry /></MemoryRouter>);
  for (let i = 0; i < 5; i++) await flush();
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  config.mockReset();
  delete (window as any).Capacitor;
});
afterEach(() => { view?.unmount(); view = null; });

describe('кабинет без входа', () => {
  it('режим «вкл», новое устройство — проба', async () => {
    config.mockResolvedValue({ mode: 'on', answersPerTrial: 3, maxChars: 2000 });
    await open('/chat');
    expect(visibleText(view!.container)).toContain('проба:on:false');
  });

  it('устройство, где входили, — экран входа без запроса к серверу', async () => {
    localStorage.setItem('linkeon_has_account', '1');
    await open('/chat');
    expect(visibleText(view!.container)).toContain('экран входа');
    expect(config).not.toHaveBeenCalled();
  });

  it('другой раздел и нативная сборка — экран входа без запроса', async () => {
    await open('/studio');
    expect(visibleText(view!.container)).toContain('экран входа');
    view!.unmount();
    (window as any).Capacitor = { isNativePlatform: () => true };
    await open('/chat');
    expect(visibleText(view!.container)).toContain('экран входа');
    expect(config).not.toHaveBeenCalled();
  });

  it('«предпросмотр» — только с ?trial=1', async () => {
    config.mockResolvedValue({ mode: 'preview', answersPerTrial: 3, maxChars: 2000 });
    await open('/chat');
    expect(visibleText(view!.container)).toContain('экран входа');
    view!.unmount();
    await open('/chat?trial=1');
    expect(visibleText(view!.container)).toContain('проба:preview:true');
  });

  it('сервер не ответил — экран входа', async () => {
    config.mockResolvedValue(null);
    await open('/');
    expect(visibleText(view!.container)).toContain('экран входа');
  });
});
