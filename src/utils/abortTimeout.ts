/**
 * Сигнал, который сам отменит запрос через ms миллисекунд.
 *
 * Ручной AbortController + setTimeout, а не AbortSignal.timeout: того нет в
 * Safari < 16 и WebView < 103, и там вызов бросает TypeError ещё до запроса —
 * любой catch вокруг принял бы это за сбой сети.
 *
 * done() снимает таймер, когда ответ уже пришёл: зовите его в finally.
 */
export function withAbortTimeout(ms: number): { signal: AbortSignal; done: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, done: () => clearTimeout(timer) };
}
