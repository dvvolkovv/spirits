import { apiClient } from './apiClient';

export interface Product {
  id: string;
  name: string;
  slug: string;
  status: 'provisioning' | 'running' | 'degraded' | 'stopped' | 'archived';
  domain: string | null;
  runner_seen_at: string | null;
  created_at: string;
}

export interface Turn {
  id: string;
  channel: 'web' | 'telegram';
  prompt: string;
  result: string | null;
  status: 'queued' | 'running' | 'done' | 'failed' | 'reverted';
  sha_before: string | null;
  sha_after: string | null;
  /** Непустое => это служебный ход отката, а не запрос к агенту. */
  revert_to_sha: string | null;
  tokens_spent: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

// Значения id приходят с бэкенда, но экранируем их сами: слэш в id незаметно
// увёл бы запрос на чужой маршрут, а экранировать дешевле, чем доказывать,
// что туда ничего подобного не попадёт.
const enc = encodeURIComponent;

export const productsApi = {
  /** Список продуктов текущего пользователя. */
  async list(): Promise<Product[]> {
    const res = await apiClient.get('/webhook/products');
    // Бэкенд может ответить не-2xx: сеть, протухший токен, деплой.
    // Кабинет должен показать пустой список, а не упасть.
    if (!res.ok) {
      return [];
    }
    return res.json();
  },

  /** История ходов продукта (50 последних, отдаёт бэкенд). */
  async turns(productId: string): Promise<Turn[]> {
    const res = await apiClient.get(`/webhook/products/${enc(productId)}/turns`);
    if (!res.ok) {
      return [];
    }
    return res.json();
  },

  /** Откат продукта к состоянию до выбранного хода. */
  async revert(productId: string, turnId: string): Promise<Response> {
    return apiClient.post(`/webhook/products/${enc(productId)}/turns/${enc(turnId)}/revert`);
  },

  /**
   * Ставит ход агента и открывает поток событий (NDJSON).
   *
   * Обычный post отдал бы клиенту всё разом в конце хода (минуты) либо
   * оборвался бы по таймауту прокси — поэтому именно fetchStream.
   */
  chatStream(productId: string, prompt: string) {
    return apiClient.fetchStream(`/webhook/products/${enc(productId)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  },
};
