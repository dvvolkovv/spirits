import { apiClient } from '../../services/apiClient';

/**
 * Ошибка `admin/shorts` с кодом ответа и содержимым поля `error` тела.
 * Машинный код (`version_conflict`, `slot_taken`) там только для структурных
 * отказов; у обычных Nest-исключений в `error` лежит имя статуса
 * («Conflict», «Bad Request», «Forbidden») — сравнивать `code` с машинными
 * значениями нужно строго через `===`. Текст — всегда с сервера: только он
 * знает, что разошлось.
 */
export class ShortsApiError extends Error {
  readonly status: number;
  readonly code: string | null;
  constructor(message: string, status: number, code: string | null = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.name = 'ShortsApiError';
  }
}

/** Как readError вкладки «Блог»: причина — в `message` (строкой или массивом), код — в `error`. */
const readError = async (r: Response): Promise<{ message: string | null; code: string | null }> => {
  try {
    const body = await r.json();
    const code = typeof body?.error === 'string' && body.error.trim() ? body.error.trim() : null;
    const m = body?.message;
    if (Array.isArray(m) && m.length) return { message: m.join('; '), code };
    if (typeof m === 'string' && m.trim()) return { message: m.trim(), code };
    return { message: code, code };
  } catch {
    // Тело не json (прокси, html-заглушка) — останется код ответа.
    return { message: null, code: null };
  }
};

export async function callShorts<T = any>(payload: Record<string, unknown>): Promise<T> {
  const r = await apiClient.post('/webhook/admin/shorts', payload);
  if (!r.ok) {
    const { message, code } = await readError(r);
    throw new ShortsApiError(message || `сервер ответил ${r.status}`, r.status, code);
  }
  return r.json();
}

export interface AgentOption {
  id: number;
  name: string;
  displayName: string;
}

/** Активные ассистенты для заказа — тот же список, что видит кабинет. Сбой — пустой список: «Любой» остаётся. */
export async function loadAgents(): Promise<AgentOption[]> {
  try {
    const r = await apiClient.get('/webhook/agents?lang=ru');
    if (!r.ok) return [];
    const rows: unknown = await r.json();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((a) => a && /^\d+$/.test(String(a.id ?? '').trim()) && Number(a.id) > 0)
      .map((a) => ({ id: Number(a.id), name: String(a.name ?? ''), displayName: String(a.displayName ?? a.name ?? a.id) }));
  } catch {
    return [];
  }
}
