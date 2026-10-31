// src/pages/OnboardingPage.claimNotice.test.tsx
// @vitest-environment jsdom
//
// E1 (решение владельца 31.10.2026): общий компьютер — проба человека A не
// должна молча утечь в аккаунт человека B (история, а через
// consolidateFromChat — и профиль ценностей). Экран входа (он же открывается
// из шапки пробы, GuestChatPage.tsx) предупреждает об этом, пока на
// устройстве есть ключ пробы, и даёт стереть его до входа («Не сохранять»).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { byButton, click, flush, mount, visibleText, type Mounted } from '../test/dom';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../components/onboarding/LoginTabs', () => ({ default: () => null }));
vi.mock('../components/settings/LanguageSelect', () => ({ LanguageSelect: () => null }));

import OnboardingPage from './OnboardingPage';

const TOKEN = 'T'.repeat(43);
const NOTICE = 'Разговор из пробы сохранится в аккаунте, в который вы войдёте.';

let view: Mounted | null = null;
async function open() {
  view = mount(
    <MemoryRouter>
      <OnboardingPage />
    </MemoryRouter>,
  );
  await flush();
}

beforeEach(() => localStorage.clear());
afterEach(() => {
  view?.unmount();
  view = null;
});

describe('экран входа предупреждает про пробу на общем устройстве (E1)', () => {
  it('ключа пробы на устройстве нет — строки нет', async () => {
    await open();
    expect(visibleText(view!.container)).not.toContain(NOTICE);
  });

  it('ключ пробы есть — строка и кнопка-ссылка «Не сохранять»', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '12' }));
    await open();
    expect(visibleText(view!.container)).toContain(NOTICE);
    const discard = byButton(view!.container, /Не сохранять/);
    expect(discard).not.toBeNull();
    // Вебвизор прячет личные данные классами — тут их нет (статичный перевод),
    // но кнопка размечена именно как button, не submit формы входа рядом.
    expect(discard!.type).toBe('button');
  });

  it('«Не сохранять» стирает ключ пробы и прячет строку', async () => {
    localStorage.setItem('guest_trial', JSON.stringify({ token: TOKEN, assistantId: '12' }));
    await open();
    click(byButton(view!.container, /Не сохранять/)!);
    expect(localStorage.getItem('guest_trial')).toBeNull();
    expect(visibleText(view!.container)).not.toContain(NOTICE);
  });
});
