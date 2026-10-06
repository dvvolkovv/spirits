import { forgetPendingAssistant, rememberPendingAssistant } from './pendingAssistant';
import { forgetPendingDestination, rememberPendingDestination } from './pendingDestination';

/**
 * Что человек собирался сделать, когда его встретил экран входа.
 *
 * Намерений два: ассистент со страницы на linkeon.io (?assistant=) и раздел
 * кабинета (кнопка «Сделать сайт или бота» → /studio?tab=products).
 * Побеждает последнее: кто сначала нажал «Сделать сайт», а потом пришёл со
 * страницы Райи, после входа должен попасть к Райе, а не в Студию, — и
 * наоборот. Иначе старое намерение всплыло бы после входа поверх нового.
 * Если ассистент и раздел пришли в одном адресе, побеждает ассистент — такие
 * ссылки сегодня никто не строит, правило закреплено тестом.
 */
export function rememberLoginIntent(pathname: string, search: string, now = Date.now()): void {
  if (rememberPendingAssistant(new URLSearchParams(search).get('assistant'), now)) {
    forgetPendingDestination();
    return;
  }
  if (rememberPendingDestination(pathname, search, now)) forgetPendingAssistant();
}
