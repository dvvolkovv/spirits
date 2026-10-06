// @vitest-environment jsdom
//
// Экран входа запоминает намерение посетителя: раздел (кнопка «Сделать сайт
// или бота» на linkeon.io) или ассистента (страница ассистента). Проверяется
// проводка OnboardingPage → loginIntent, а не сама логика (она в loginIntent.test.ts).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { flush, mount, type Mounted } from '../test/dom';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../components/onboarding/LoginTabs', () => ({ default: () => null }));
vi.mock('../components/settings/LanguageSelect', () => ({ LanguageSelect: () => null }));

import OnboardingPage from './OnboardingPage';

let view: Mounted | null = null;
async function open(url: string) {
  view = mount(
    <MemoryRouter initialEntries={[url]}>
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

describe('экран входа запоминает намерение', () => {
  it('кнопка «Сделать сайт или бота» — раздел', async () => {
    await open('/studio?tab=products&utm_content=sites&lang=ru');
    expect(JSON.parse(localStorage.getItem('pending_destination') ?? 'null')?.value).toBe('/studio?tab=products');
  });

  it('страница ассистента — ассистент', async () => {
    await open('/chat?assistant=14');
    expect(JSON.parse(localStorage.getItem('pending_assistant') ?? 'null')?.value).toBe('14');
  });
});
