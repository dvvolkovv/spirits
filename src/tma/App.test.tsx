// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { mount, flush, visibleText, tRu } from '../test/dom';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../services/productActionsApi', () => ({
  productActionsApi: {
    get: vi.fn(async () => ({
      id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', kind: 'keys', status: 'pending', productId: 'p1', productName: 'Бот',
      productKind: 'bot', keyNames: ['BOT_TOKEN'], expiresAt: null, restoreUntil: null, result: null,
    })),
    submit: vi.fn(),
    cancel: vi.fn(),
  },
  isProblem: (x: any) => x?.ok === false,
}));
// Вкладки мини-приложения при ?pa= не рисуются — подменяем, чтобы их модули
// не тянули в тест свои запросы и хранилища.
vi.mock('./screens/DayScreen', () => ({ DayScreen: () => null }));
vi.mock('./screens/AssistantsScreen', () => ({ AssistantsScreen: () => null }));
vi.mock('./screens/SearchScreen', () => ({ SearchScreen: () => null }));
vi.mock('./screens/WalletScreen', () => ({ WalletScreen: () => null }));
vi.mock('./screens/ProfileScreen', () => ({ ProfileScreen: () => null }));
vi.mock('./telegram', () => ({ closeApp: vi.fn() }));

import { App } from './App';

describe('мини-приложение: карточка ключей по кнопке из Telegram', () => {
  it('?pa=<id> открывает карточку ключей вместо вкладок', async () => {
    window.history.replaceState({}, '', '/tma/?pa=aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    const { container } = mount(<App />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.keys.title', { name: 'Бот' }));
    expect(container.querySelector('[data-testid="product-action-key-replace"]')).not.toBeNull();
  });
});
