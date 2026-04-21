import { BASE_URL } from './testData';
import { assertIsTestPhone } from './guards';
import { fetchOtp } from './otp';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  /** Full profile object from GET /webhook/profile. Stored into localStorage as 'userData'. */
  userData: Record<string, unknown>;
}

// Известные UUID-вебхуки из frontend/src/services/authService.ts. Если фронт
// когда-нибудь их изменит — обновить здесь.
const SMS_WEBHOOK_UUID = '898c938d-f094-455c-86af-969617e62f7a';
const CHECK_WEBHOOK_UUID = 'a376a8ed-3bf7-4f23-aaa5-236eea72871b';

/**
 * Выполняет полный auth-flow через API (без UI): SMS → OTP → check-code → profile.
 * Возвращает токены и userData, готовые к записи в localStorage.
 */
export async function loginViaApi(phone: string): Promise<LoginResult> {
  assertIsTestPhone(phone);

  // 1. Запрашиваем SMS-код.
  const smsRes = await fetch(`${BASE_URL}/webhook/${SMS_WEBHOOK_UUID}/sms/${phone}`);
  if (!smsRes.ok) {
    throw new Error(`login: SMS request failed ${smsRes.status} ${await smsRes.text()}`);
  }

  // 2. Читаем код из debug-эндпоинта (ретраим, Redis может не успеть).
  const code = await fetchOtp(phone, { retries: 10, delayMs: 1000 });

  // 3. Проверяем код → получаем токены.
  const checkRes = await fetch(
    `${BASE_URL}/webhook/${CHECK_WEBHOOK_UUID}/check-code/${phone}/${code}`,
  );
  if (!checkRes.ok) {
    throw new Error(`login: check-code failed ${checkRes.status} ${await checkRes.text()}`);
  }
  const authBody = (await checkRes.json()) as { 'access-token'?: string; 'refresh-token'?: string };
  const accessToken = authBody['access-token'];
  const refreshToken = authBody['refresh-token'];
  if (!accessToken || !refreshToken) {
    throw new Error(`login: missing tokens in response: ${JSON.stringify(authBody)}`);
  }

  // 4. Грузим профиль, чтобы положить в localStorage 'userData'.
  const profileRes = await fetch(`${BASE_URL}/webhook/profile`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profileRes.ok) {
    throw new Error(`login: profile fetch failed ${profileRes.status} ${await profileRes.text()}`);
  }
  const rawProfile = (await profileRes.json()) as unknown;

  // Нормализуем: AuthContext.initAuth ожидает объект с полем phone.
  // API возвращает массив [{ profileJson: {...} }], нужно извлечь поля.
  let userData: Record<string, unknown>;
  const profileRecord = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
  const profileJson = (profileRecord as any)?.profileJson ?? profileRecord ?? {};

  userData = {
    id: phone,
    phone,
    firstName: profileJson.name ?? '',
    lastName: profileJson.family_name ?? '',
    isAdmin: profileJson.isadmin === true,
    tokens: typeof profileJson.tokens === 'string' ? Number(profileJson.tokens) : (profileJson.tokens ?? 0),
    email: profileJson.email ?? '',
    preferredAgent: profileJson.preferred_agent ?? '',
  };

  return { accessToken, refreshToken, userData };
}
