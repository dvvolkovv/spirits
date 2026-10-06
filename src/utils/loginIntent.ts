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
 */
export function rememberLoginIntent(pathname: string, search: string, now = Date.now()): void {
  const assistant = new URLSearchParams(search).get('assistant');
  if (assistant?.trim()) {
    rememberPendingAssistant(assistant, now);
    forgetPendingDestination();
    return;
  }
  if (rememberPendingDestination(pathname, search, now)) forgetPendingAssistant();
}
