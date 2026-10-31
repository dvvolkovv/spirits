import { apiClient } from '../../services/apiClient';
import { readGuestStream } from './guestStream';
import type { GuestAgent, GuestConfig, GuestEvent, GuestMessage } from './guestTypes';

/** Дольше — гостю надоело ждать: показываем экран входа, как было до пробы. Вечно ждать нельзя. */
const GUEST_CONFIG_TIMEOUT_MS = 4000;
/** Ассистенты и восстановление разговора — операции чуть тяжелее config, но тоже не вечные. */
const GUEST_LOAD_TIMEOUT_MS = 8000;

/** Ручной AbortController + setTimeout: не AbortSignal.timeout — его нет в старых Safari. */
function withAbortTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}

/** Непрочитанное тело держит соединение; не ждём его освобождения — не тормозим этим ход гостя. */
function drain(r: Response): void {
  r.body?.cancel().catch(() => {});
}

/** `Number(x) || fallback` пропускает отрицательные (они истинные) — здесь это не тот дефолт, что нужен. */
function positiveNumberOr(raw: unknown, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseGuestConfigPayload(j: any): GuestConfig {
  const mode = j?.mode === 'on' || j?.mode === 'preview' ? j.mode : 'off';
  return {
    mode,
    answersPerTrial: positiveNumberOr(j?.answersPerTrial, 3),
    maxChars: positiveNumberOr(j?.maxChars, 2000),
  };
}

/**
 * Забирает и удаляет разовый ранний запрос из index.html (I1, скрипт
 * data-guest-config-prefetch) — один раз: второй вызов fetchGuestConfig в
 * этой же вкладке (смена языка, повторный заход на экран пробы) должен идти
 * обычным запросом, а не чужим уже прочитанным промисом. typeof window —
 * guestApi.ts подключают и тесты без jsdom (guestApi.test.ts, окружение
 * node): там window нет вовсе, и это не префетч, а обычный путь.
 */
function takeGuestConfigPrefetch(): Promise<unknown> | null {
  if (typeof window === 'undefined') return null;
  try {
    const w = window as unknown as { __guestConfigPrefetch?: Promise<unknown> };
    const p = w.__guestConfigPrefetch;
    if (p) delete w.__guestConfigPrefetch;
    return p ?? null;
  } catch {
    return null;
  }
}

/**
 * Режим пробы с сервера. null — сервер не ответил, ответил ошибкой или не
 * уложился в GUEST_CONFIG_TIMEOUT_MS: кабинет покажет экран входа, как раньше.
 *
 * I1 (ревью качества B9-fix): если встроенный скрипт index.html уже запустил
 * запрос (window.__guestConfigPrefetch) до загрузки бандла — используем его
 * вместо нового запроса, под тем же потолком GUEST_CONFIG_TIMEOUT_MS (сам
 * префетч не ограничен по времени — он просто fetch().catch(() => null) без
 * зависимостей). Сам префетч уже привёл ответ к { mode, answersPerTrial,
 * maxChars } | null (r.ok ? r.json() : null) или к null при сетевой ошибке —
 * разбираем его тем же parseGuestConfigPayload, что и обычный ответ.
 */
export async function fetchGuestConfig(): Promise<GuestConfig | null> {
  const prefetch = takeGuestConfigPrefetch();
  if (prefetch) {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => resolve(null), GUEST_CONFIG_TIMEOUT_MS);
    });
    try {
      const j = await Promise.race([prefetch.catch(() => null), timeout]);
      return j ? parseGuestConfigPayload(j) : null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  const { signal, done } = withAbortTimeout(GUEST_CONFIG_TIMEOUT_MS);
  try {
    const r = await apiClient.get('/webhook/guest/config', { skipAuth: true, signal });
    if (!r.ok) { drain(r); return null; }
    const j = await r.json();
    return parseGuestConfigPayload(j);
  } catch {
    return null;
  } finally {
    done();
  }
}

/** Ассистенты экрана выбора — публичная ручка, имена на языке гостя. */
export async function fetchGuestAgents(lang: string): Promise<GuestAgent[]> {
  const { signal, done } = withAbortTimeout(GUEST_LOAD_TIMEOUT_MS);
  try {
    const r = await apiClient.get(`/webhook/agents?lang=${encodeURIComponent(lang)}`, { skipAuth: true, signal });
    if (!r.ok) { drain(r); return []; }
    const list = await r.json();
    if (!Array.isArray(list)) return [];
    return list
      .map((a: any) => ({ id: String(a?.id ?? ''), name: String(a?.displayName || a?.name || '') }))
      .filter((a) => /^\d+$/.test(a.id) && a.name !== '');
  } catch {
    return [];
  } finally {
    done();
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

/** 'server' — страница показывает как «ассистент сейчас недоступен», а не как «нет сети»; 'network' — только исключение fetch и обрыв потока. */
export type GuestSendResult = 'ok' | 'trial_gone' | 'busy_trial' | 'bad_request' | 'network' | 'aborted' | 'server';

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
  if (r.status === 404) { drain(r); return 'trial_gone'; }
  if (r.status === 409) {
    const j = await r.json().catch(() => ({}));
    return j?.error === 'assistant_mismatch' ? 'trial_gone' : 'busy_trial';
  }
  if (r.status === 400) { drain(r); return 'bad_request'; }
  if (!r.ok) { drain(r); return 'server'; }
  if (!r.body) return 'server';
  try {
    await readGuestStream(r.body.getReader(), onEvent);
  } catch (e) {
    return isAbortError(e) ? 'aborted' : 'network';
  }
  return 'ok';
}

export type GuestSessionResult =
  | { status: 'ok'; assistantId: string; messages: GuestMessage[]; left: number }
  | { status: 'gone' }
  | { status: 'error' };

/**
 * Разговор пробы после перезагрузки страницы. Различает две разные причины
 * неуспеха (ревью качества B9-fix, M3): 'gone' — сервер явно ответил «пробы
 * нет» (404 { error: 'trial' }); 'error' — сбой (сеть, 5xx, таймаут
 * GUEST_LOAD_TIMEOUT_MS). Раньше оба давали null, и страница на любой из них
 * стирала ключ пробы — это расходилось с правилом «при сбое ключ остаётся»:
 * временная недоступность сервера не должна хоронить начатую пробу.
 */
export async function loadGuestSession(token: string): Promise<GuestSessionResult> {
  const { signal, done } = withAbortTimeout(GUEST_LOAD_TIMEOUT_MS);
  try {
    const r = await apiClient.post('/webhook/guest/session', { token }, { skipAuth: true, signal });
    if (r.status === 404) { drain(r); return { status: 'gone' }; }
    if (!r.ok) { drain(r); return { status: 'error' }; }
    const j = await r.json();
    const messages: GuestMessage[] = Array.isArray(j?.messages)
      ? j.messages
          .filter((m: any) => (m?.role === 'user' || m?.role === 'assistant') && typeof m?.content === 'string')
          .map((m: any) => ({ role: m.role, content: m.content }))
      : [];
    return { status: 'ok', assistantId: String(j?.assistantId ?? ''), messages, left: Math.max(0, Number(j?.left) || 0) };
  } catch {
    return { status: 'error' };
  } finally {
    done();
  }
}

export type GuestClaimResult = { status: 'claimed'; assistantId: string } | { status: 'gone' } | { status: 'retry' };

/**
 * Перенос пробы в аккаунт, в который только что вошли (запрос — с токеном входа).
 * 'retry' не означает «без побочных эффектов»: если оба токена входа мёртвые,
 * apiClient сам очистит их и уведёт на экран входа.
 */
export async function claimGuestTrial(token: string): Promise<GuestClaimResult> {
  try {
    const r = await apiClient.post('/webhook/guest/claim', { token });
    if (r.ok) {
      const j = await r.json().catch(() => ({}));
      const id = String(j?.assistantId ?? '');
      return /^\d+$/.test(id) ? { status: 'claimed', assistantId: id } : { status: 'gone' };
    }
    drain(r);
    return r.status === 404 || r.status === 409 ? { status: 'gone' } : { status: 'retry' };
  } catch {
    return { status: 'retry' };
  }
}
