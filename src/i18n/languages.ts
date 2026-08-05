export interface LanguageDef {
  /** Корень BCP-47: ru, en, es, de, fr, zh */
  code: string;
  /** Название языка на нём самом — так его ищут в списке */
  nativeName: string;
  flag: string;
}

// i18n-ignore: nativeName — название языка на нём самом, это данные реестра,
// а не UI-текст: испанец должен видеть «Русский», а не «Ruso».
export const SUPPORTED_LANGUAGES: LanguageDef[] = [
  { code: 'ru', nativeName: 'Русский', flag: '🇷🇺' },
  { code: 'en', nativeName: 'English', flag: '🇺🇸' },
  { code: 'es', nativeName: 'Español', flag: '🇪🇸' },
  { code: 'de', nativeName: 'Deutsch', flag: '🇩🇪' },
  { code: 'fr', nativeName: 'Français', flag: '🇫🇷' },
  { code: 'zh', nativeName: '中文', flag: '🇨🇳' },
];

export const DEFAULT_LANGUAGE = 'ru';

export const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

/**
 * Схлопывает произвольный тег языка до поддерживаемого корня.
 * navigator.language отдаёт es-MX / zh-Hans, профиль может отдать что угодно.
 */
export function resolveLanguage(raw?: string | null): string {
  if (!raw) return DEFAULT_LANGUAGE;
  const root = raw.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_CODES.includes(root) ? root : DEFAULT_LANGUAGE;
}
