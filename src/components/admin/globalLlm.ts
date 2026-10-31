import { apiClient } from '../../services/apiClient';

export type Provider = 'claude' | 'qwen' | 'kimi';
export const PROVIDERS: Provider[] = ['claude', 'qwen', 'kimi'];
export const PROVIDER_LABELS: Record<Provider, string> = { claude: 'Claude', qwen: 'Qwen', kimi: 'Kimi' };

export interface GlobalLlmState {
  provider: Provider;
  since: string | null;
  by: string | null;
  configured: { qwen: boolean; kimi: boolean };
}

/** Смена рубильника в этой вкладке: блок сообщает, плашка слушает. */
export const GLOBAL_LLM_EVENT = 'linkeon:global-llm-changed';
export const GLOBAL_LLM_URL = '/webhook/admin/llm-provider';

export function toGlobalState(j: any): GlobalLlmState {
  return {
    provider: j?.provider === 'qwen' || j?.provider === 'kimi' ? j.provider : 'claude',
    since: typeof j?.since === 'string' ? j.since : null,
    by: typeof j?.by === 'string' ? j.by : null,
    configured: { qwen: j?.configured?.qwen === true, kimi: j?.configured?.kimi === true },
  };
}

export async function fetchGlobalLlm(): Promise<GlobalLlmState> {
  const r = await apiClient.get(GLOBAL_LLM_URL);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return toGlobalState(await r.json());
}

/** null в .error — успех. */
export async function saveGlobalLlm(provider: Provider): Promise<{ state: GlobalLlmState | null; error: string | null }> {
  const r = await apiClient.post(GLOBAL_LLM_URL, { provider });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) return { state: null, error: j?.error === 'no_key' ? 'no_key' : `HTTP ${r.status}` };
  return { state: toGlobalState(j), error: null };
}

/** дд.мм чч:мм в местном времени браузера — без зависимости от локали. */
export function fmtSince(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function announceGlobalLlm(state: GlobalLlmState): void {
  window.dispatchEvent(new CustomEvent(GLOBAL_LLM_EVENT, { detail: state }));
}
