import { apiClient } from '../../services/apiClient';
import { readGuestStream } from './guestStream';
import type { GuestAgent, GuestConfig, GuestEvent, GuestMessage } from './guestTypes';

/** Режим пробы с сервера. null — сервер не ответил: кабинет покажет экран входа, как раньше. */
export async function fetchGuestConfig(): Promise<GuestConfig | null> {
  try {
    const r = await apiClient.get('/webhook/guest/config', { skipAuth: true });
    if (!r.ok) return null;
    const j = await r.json();
    const mode = j?.mode === 'on' || j?.mode === 'preview' ? j.mode : 'off';
    return { mode, answersPerTrial: Number(j?.answersPerTrial) || 3, maxChars: Number(j?.maxChars) || 2000 };
  } catch {
    return null;
  }
}

/** Ассистенты экрана выбора — публичная ручка, имена на языке гостя. */
export async function fetchGuestAgents(lang: string): Promise<GuestAgent[]> {
  try {
    const r = await apiClient.get(`/webhook/agents?lang=${encodeURIComponent(lang)}`, { skipAuth: true });
    if (!r.ok) return [];
    const list = await r.json();
    if (!Array.isArray(list)) return [];
    return list
      .map((a: any) => ({ id: String(a?.id ?? ''), name: String(a?.displayName || a?.name || '') }))
      .filter((a) => /^\d+$/.test(a.id) && a.name !== '');
  } catch {
    return [];
  }
}

export interface GuestSendInput {
  token: string | null;
  assistantId: string;
  message: string;
  lang: string;
  tz: string;
  preview: boolean;
  source: string | null;
  campaign: string | null;
  sid: string | null;
}

export type GuestSendResult = 'ok' | 'trial_gone' | 'busy_trial' | 'bad_request' | 'network' | 'aborted';

/** Уход со страницы во время хода — не «нет сети», страницы уже нет, чтобы его показать. */
function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError';
}

export async function sendGuestMessage(
  input: GuestSendInput,
  onEvent: (e: GuestEvent) => void,
  signal?: AbortSignal,
): Promise<GuestSendResult> {
  let r: Response;
  try {
    r = await apiClient.post('/webhook/guest/chat', input, { skipAuth: true, signal });
  } catch (e) {
    return isAbortError(e) ? 'aborted' : 'network';
  }
  if (r.status === 404) return 'trial_gone';
  if (r.status === 409) {
    const j = await r.json().catch(() => ({}));
    return j?.error === 'assistant_mismatch' ? 'trial_gone' : 'busy_trial';
  }
  if (r.status === 400) return 'bad_request';
  if (!r.ok || !r.body) return 'network';
  try {
    await readGuestStream(r.body.getReader(), onEvent);
  } catch (e) {
    return isAbortError(e) ? 'aborted' : 'network';
  }
  return 'ok';
}

export async function loadGuestSession(token: string): Promise<{ assistantId: string; messages: GuestMessage[]; left: number } | null> {
  try {
    const r = await apiClient.post('/webhook/guest/session', { token }, { skipAuth: true });
    if (!r.ok) return null;
    const j = await r.json();
    const messages: GuestMessage[] = Array.isArray(j?.messages)
      ? j.messages
          .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
          .map((m: any) => ({ role: m.role, content: m.content }))
      : [];
    return { assistantId: String(j?.assistantId ?? ''), messages, left: Math.max(0, Number(j?.left) || 0) };
  } catch {
    return null;
  }
}

export type GuestClaimResult = { status: 'claimed'; assistantId: string } | { status: 'gone' } | { status: 'retry' };

/** Перенос пробы в аккаунт, в который только что вошли (запрос — с токеном входа). */
export async function claimGuestTrial(token: string): Promise<GuestClaimResult> {
  try {
    const r = await apiClient.post('/webhook/guest/claim', { token });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const id = String(j?.assistantId ?? '');
      return /^\d+$/.test(id) ? { status: 'claimed', assistantId: id } : { status: 'gone' };
    }
    return r.status === 404 || r.status === 409 ? { status: 'gone' } : { status: 'retry' };
  } catch {
    return { status: 'retry' };
  }
}
