import { BASE_URL } from './testData';
import { assertIsTestPhone } from './guards';

/**
 * Получить последний SMS-код для тестового номера через debug-эндпоинт.
 * Работает только если на бэке DEBUG_SMS_CODES=true и номер в whitelist.
 *
 * @param phone — цифровая строка без +, например '70000000000'
 * @param opts.retries — сколько раз ретраить (код может ещё не успеть записаться в Redis)
 * @param opts.delayMs — пауза между попытками
 */
export async function fetchOtp(
  phone: string,
  opts: { retries?: number; delayMs?: number } = {},
): Promise<string> {
  assertIsTestPhone(phone);
  const retries = opts.retries ?? 5;
  const delayMs = opts.delayMs ?? 1000;

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(`${BASE_URL}/webhook/debug/sms-code/${phone}`);
    if (res.ok) {
      const body = (await res.json()) as { code?: string };
      if (body.code) return body.code;
    } else if (res.status === 403) {
      throw new Error(`fetchOtp: phone ${phone} rejected by backend whitelist`);
    }
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  throw new Error(
    `fetchOtp: no code for ${phone} after ${retries} attempts ` +
    `(backend DEBUG_SMS_CODES might be off, or SMS request wasn't sent yet)`,
  );
}
