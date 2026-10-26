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
  keyNames: string[];
  expiresAt: string | null;
  restoreUntil: string | null;
  result: { error?: string; reason?: string; productId?: string; botUsername?: string; restoreUntil?: string } | null;
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
  return (await res.json()) as ProductActionView;
}

export const productActionsApi = {
  get: (id: string) => call(() => apiClient.get(`/webhook/product-actions/${enc(id)}`)),
  submit: (id: string, body: { confirm?: true; set?: Record<string, string>; via: ActionSource }) =>
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
