import { apiClient } from '../../services/apiClient';

// Называется AnswerProvider, а не Provider: «Provider» в этой кодовой базе
// легко спутать с другими «провайдерами» (OAuth, оплата) — ревью качества
// 01.11.2026 к задачам 10-12.
export type AnswerProvider = 'claude' | 'qwen' | 'kimi';
export const PROVIDERS: readonly AnswerProvider[] = ['claude', 'qwen', 'kimi'];
export const PROVIDER_LABELS: Record<AnswerProvider, string> = { claude: 'Claude', qwen: 'Qwen', kimi: 'Kimi' };

/** Строка из бэка → известная модель; мусор/отсутствие — Claude, как и у рубильника без строки в БД. */
export function parseProvider(v: unknown): AnswerProvider {
  return v === 'qwen' || v === 'kimi' || v === 'claude' ? v : 'claude';
}

export interface GlobalLlmState {
  provider: AnswerProvider;
  since: string | null;
  by: string | null;
  configured: { qwen: boolean; kimi: boolean };
}

/** Смена рубильника в этой вкладке: блок сообщает, плашка слушает. */
export const GLOBAL_LLM_EVENT = 'linkeon:global-llm-changed';
export const GLOBAL_LLM_URL = '/webhook/admin/llm-provider';

export function toGlobalState(j: any): GlobalLlmState {
  return {
    provider: parseProvider(j?.provider),
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

/**
 * Размеченное объединение, а не { state, error } с обоими полями нулевыми в
 * одном из случаев: раньше `.catch(() => ({}))` стоял на разборе json() и
 * для успешного ответа — разбитый JSON при 200 тихо превращался в «успешно
 * переключили на Claude» (ревью качества 01.11.2026). Теперь .catch — только
 * на ветке !r.ok (там отсутствие тела — обычное дело, например у 409 без
 * JSON), а бракованный ответ на успехе бросает исключение и доходит до
 * вызывающего как настоящая ошибка.
 */
export type SaveGlobalLlmResult =
  | { ok: true; state: GlobalLlmState }
  | { ok: false; error: string };

export async function saveGlobalLlm(provider: AnswerProvider): Promise<SaveGlobalLlmResult> {
  const r = await apiClient.post(GLOBAL_LLM_URL, { provider });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: j?.error === 'no_key' ? 'no_key' : `HTTP ${r.status}` };
  }
  return { ok: true, state: toGlobalState(await r.json()) };
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
