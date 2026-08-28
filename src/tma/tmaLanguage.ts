import { SUPPORTED_CODES } from '../i18n/languages';

/**
 * Какой язык показывать в Mini App.
 *
 * Порядок: явный выбор человека в профиле → язык его приложения Telegram →
 * null (пусть решает детектор i18next по устройству).
 *
 * Почему профиль первый: profile_data.language человек выставил сам в
 * настройках Linkeon, а language_code — это лишь язык интерфейса Telegram,
 * который на общем устройстве может быть чужим.
 *
 * Зачем это вообще: детектор i18next настроен на
 * ['querystring', 'localStorage', 'navigator'], а в WebView Telegram
 * localStorage пуст — оставался только язык устройства. Владелец открыл
 * мини-апп с англоязычного iPhone и получил английский интерфейс при русском
 * профиле (замер по логам прода 28.08.2026: WebView скачал только en-*.js).
 *
 * Неизвестные коды отбрасываем, а не подставляем: i18next на незнакомой
 * локали молча свалится в фолбэк, и мы потеряем следующий источник.
 */
export function resolveTmaLanguage(src: {
  profileLanguage: string | null;
  telegramLanguage: string | null;
}): string | null {
  const normalize = (v: string | null): string | null => {
    if (!v) return null;
    const base = v.toLowerCase().split(/[-_]/)[0];
    return SUPPORTED_CODES.includes(base) ? base : null;
  };
  return normalize(src.profileLanguage) ?? normalize(src.telegramLanguage);
}

/**
 * Язык из ответа GET /webhook/profile.
 *
 * Форма — `[{ profileJson: {...} }]` (profile.service.ts getProfile), со
 * старым `profile_data` как запасным вариантом: ровно так же разбирает
 * профиль extractPreferredAgent в assistantsFlow.ts.
 */
export function extractProfileLanguage(raw: unknown): string | null {
  const record = Array.isArray(raw) ? raw[0] : raw;
  const data = (record as any)?.profileJson ?? record ?? {};
  const language = data?.profile_data?.language ?? data?.language;
  return typeof language === 'string' && language ? language : null;
}
