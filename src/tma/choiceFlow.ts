/**
 * Логика экрана первого выбора (Task 8), вынесенная из JSX, чтобы её можно
 * было протестировать без рендера React-дерева.
 *
 * Порядок в runConfirmLink принципиален и это единственное, что здесь
 * действительно важно: сначала вход по SMS в СУЩЕСТВУЮЩИЙ аккаунт, только
 * потом привязка Telegram к нему. Обратный порядок (сперва завести
 * telegram-аккаунт, потом влить в него телефонный) уничтожил бы баланс —
 * mergeAccounts на бэке переносит только строки идентичностей, токены,
 * история и задачи остаются на исходном аккаунте, который при этом
 * помечается удалённым. Эти функции не должны звать ничего похожего на
 * merge — ни прямо, ни через промежуточный эндпоинт.
 */
import { tmaLogin, tmaLinkExisting } from './tmaAuth';
import { authService } from '../services/authService';
import { tokenManager } from '../utils/tokenManager';

export type StartResult = { ok: true } | { ok: false };

/** Кнопка «Начать»: создаёт свежий аккаунт (welcome-бонус на бэке). */
export async function runStart(): Promise<StartResult> {
  const r = await tmaLogin({ intent: 'signup' });
  return { ok: r.status === 'authenticated' };
}

export type ConfirmLinkResult =
  | { status: 'ok' }
  | { status: 'wrongCode' }
  | { status: 'conflict' }
  | { status: 'failed' };

/**
 * Кнопка «У меня уже есть аккаунт», финальный шаг после ввода SMS-кода.
 *
 * 1. authService.verifyCode — вход в существующий аккаунт по SMS. При успехе
 *    он сам сохраняет пару JWT в tokenManager (см. authService.ts) — здесь
 *    их сохранять повторно не нужно.
 * 2. Только после успешного входа — tmaLinkExisting(), привязка Telegram к
 *    уже аутентифицированному аккаунту.
 *
 * Если шаг 2 не 'ok' (в том числе 409-конфликт — Telegram уже занят другим
 * аккаунтом Linkeon), токены, полученные на шаге 1, гасятся: иначе человек
 * остался бы залогинен в аккаунт, к которому это устройство Telegram так и
 * не привязалось — рассинхрон между тем, во что верит фронт, и тем, что
 * знает бэк.
 */
export async function runConfirmLink(phone: string, code: string): Promise<ConfirmLinkResult> {
  const auth = await authService.verifyCode(phone, code);
  if (!auth.success) return { status: 'wrongCode' };

  const linked = await tmaLinkExisting();
  if (linked.status === 'ok') return { status: 'ok' };

  tokenManager.clearTokens();
  return linked.status === 'conflict' ? { status: 'conflict' } : { status: 'failed' };
}

export type SendCodeResult = { ok: true } | { ok: false };

/** Промежуточный шаг «Получить код» — просто прокси к authService с типизированным результатом. */
export async function runSendCode(phone: string): Promise<SendCodeResult> {
  const r = await authService.requestSMSCode(phone);
  return { ok: r.success };
}
