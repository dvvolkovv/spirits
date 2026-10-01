/**
 * Заголовок для debug-ручек бэкенда (/webhook/debug/*). С 01.10.2026 они
 * отвечают только на запрос с `X-Debug-Secret`, совпадающим с `DEBUG_SECRET`
 * из .env бэкенда той среды, куда идут тесты; без него — 404.
 *
 * Секрет в репозиторий не кладётся: передайте его переменной окружения
 * DEBUG_SECRET при запуске (лучше секрет test-стенда, не прода).
 */
export function debugHeaders(): Record<string, string> {
  const secret = process.env.DEBUG_SECRET?.trim();
  if (!secret) {
    throw new Error(
      'задай DEBUG_SECRET — секрет debug-ручек из .env бэкенда той среды, куда идут тесты',
    );
  }
  return { 'X-Debug-Secret': secret };
}
