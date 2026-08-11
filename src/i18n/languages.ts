export interface LanguageDef {
  /** Корень BCP-47: ru, en, es, de, fr, zh, pt */
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
  // Европейский португальский (pt-PT), а не бразильский: витрина в App Store
  // заведена как Portuguese (Portugal). Код корневой — 'pt', чтобы
  // resolveLanguage схлопывал сюда и pt-PT, и pt-BR: бразильцу европейский
  // текст понятен, а фолбэк в английский — нет.
  { code: 'pt', nativeName: 'Português', flag: '🇵🇹' },
];

export const DEFAULT_LANGUAGE = 'ru';

/**
 * Что показать посетителю, чьей локали у нас нет (uk, ja, pl…).
 *
 * Отдельная константа, а не DEFAULT_LANGUAGE: у русского здесь другая роль —
 * это язык-источник переводов и канонический корень лендинга. Смешивать две
 * роли в одной константе нельзя, иначе португалец получает кириллицу просто
 * потому, что русский оказался первым в реестре.
 */
export const VISITOR_FALLBACK = 'en';

/**
 * Чем закрывать ключ, которого нет в текущей локали. Сначала английский,
 * русский — последним рубежом: в es/de/fr/zh не хватает по ~250 ключей из
 * 1665, и немец на непереведённом экране должен видеть английский текст,
 * а не русский.
 *
 * pt заполнен целиком (1660 ключей: все 1665 русских минус пять форм `_few`,
 * которых в португальском множественном числе нет), поэтому до цепочки он
 * доходить не должен — но она всё равно его страхует.
 */
export const FALLBACK_CHAIN = ['en', 'ru'];

export const SUPPORTED_CODES = SUPPORTED_LANGUAGES.map((l) => l.code);

/**
 * Схлопывает произвольный тег языка до поддерживаемого корня.
 * navigator.language отдаёт es-MX / zh-Hans, профиль может отдать что угодно.
 */
export function resolveLanguage(raw?: string | null): string {
  if (!raw) return VISITOR_FALLBACK;
  const root = raw.toLowerCase().split(/[-_]/)[0];
  return SUPPORTED_CODES.includes(root) ? root : VISITOR_FALLBACK;
}
