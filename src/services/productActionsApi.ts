import { apiClient } from './apiClient';
import { problem, type Problem } from './productsApi';

export type ProductActionKind = 'create_site' | 'create_bot' | 'keys' | 'delete' | 'restore' | 'revert' | 'purge';
export type ProductActionStatus = 'pending' | 'working' | 'done' | 'failed' | 'expired' | 'cancelled';

export interface ProductActionView {
  id: string;
  kind: ProductActionKind;
  status: ProductActionStatus;
  productId: string | null;
  productName: string | null;
  /** Форма продукта (с очереди 2). Необязательное: сервер старше фронта поля не шлёт. */
  productKind?: 'site' | 'bot' | null;
  keyNames: string[];
  expiresAt: string | null;
  restoreUntil: string | null;
  result: { error?: string; reason?: string; productId?: string; botUsername?: string; restoreUntil?: string; keyNames?: string[] } | null;
}

export type ActionSource = 'chat' | 'cabinet' | 'tma';

export function isProblem(x: ProductActionView | Problem): x is Problem {
  return (x as Problem).ok === false;
}

const enc = encodeURIComponent;

async function call(fn: () => Promise<Response>): Promise<ProductActionView | Problem> {
  let res: Response;
  try {
    res = await fn();
  } catch {
    return { ok: false, status: 0, message: '' };
  }
  if (!res.ok) return problem(res);
  // 2xx без годного JSON-тела (SPA-фолбэк этого хостинга отдаёт 200 с HTML на
  // любой путь — см. такой же разбор в domainCall/productsApi.ts) не должен
  // уронить вызывающего необработанным исключением из res.json(): без этой
  // защиты карточка осталась бы в вечном "загрузка" вместо текста отказа.
  const body = (await res.json().catch(() => null)) as ProductActionView | null;
  if (!body || typeof body !== 'object' || typeof body.id !== 'string') {
    return { ok: false, status: res.status, message: '' };
  }
  return body;
}

export const productActionsApi = {
  get: (id: string) => call(() => apiClient.get(`/webhook/product-actions/${enc(id)}`)),
  submit: (id: string, body: { confirm?: true; set?: Record<string, string>; remove?: string[]; via: ActionSource }) =>
    call(() => apiClient.post(`/webhook/product-actions/${enc(id)}`, body)),
  cancel: (id: string) => call(() => apiClient.post(`/webhook/product-actions/${enc(id)}/cancel`)),
  async pending(): Promise<ProductActionView[]> {
    try {
      const res = await apiClient.get('/webhook/product-actions');
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j) ? j : [];
    } catch {
      return [];
    }
  },
};
