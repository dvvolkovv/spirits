// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clickAsync, flush, mount, type, visibleText, type Mounted } from '../../test/dom';
import SearchInterface from './SearchInterface';
import { apiClient } from '../../services/apiClient';

vi.mock('react-i18next', async () => {
  const { tRu } = await import('../../test/dom');
  return { useTranslation: () => ({ t: (key: string, options?: Record<string, unknown>) => key === 'search.intent_placeholders' ? ['партнёра'] : tRu(key, options) }) };
});
vi.mock('../../services/apiClient', () => ({ apiClient: { post: vi.fn() } }));
const api = vi.mocked(apiClient);
let view: Mounted | null = null;

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Object.defineProperty(window, 'scrollTo', { value: vi.fn(), writable: true });
});
afterEach(() => { view?.unmount(); view = null; });

it('removes legacy other-user cards but preserves my query', async () => {
  localStorage.setItem('search_query', 'мой запрос');
  localStorage.setItem('search_results', JSON.stringify([{ id: '7', name: 'Чужой профиль', values: [], intents: [], corellation: 1 }]));
  localStorage.setItem('search_comment', 'чужие данные');
  localStorage.setItem('has_searched', 'true');
  view = mount(<SearchInterface />);
  await flush(); await flush();
  expect(visibleText(view.container)).not.toContain('Чужой профиль');
  expect(localStorage.getItem('search_query')).toBe('мой запрос');
  for (const key of ['search_results', 'search_comment', 'has_searched']) expect(localStorage.getItem(key)).toBeNull();
});

it('does not recreate result keys after search and React effects', async () => {
  api.post.mockReturnValue(new Promise(() => {}));
  view = mount(<SearchInterface />);
  await flush();
  type(view.container.querySelector('[data-testid="search-input"]')!, 'новый запрос');
  await clickAsync(view.container.querySelector('[data-testid="search-submit-btn"]')!);
  await flush();
  expect(api.post).toHaveBeenCalledWith('/webhook/search-mate', { query: 'новый запрос' });
  for (const key of ['search_results', 'search_comment', 'has_searched']) expect(localStorage.getItem(key)).toBeNull();
});
