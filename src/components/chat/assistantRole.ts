/**
 * Роль ассистента для бейджа на карточке.
 *
 * Определяется по стабильному id, а НЕ по тексту описания. Раньше в двух местах
 * независимо жил поиск русских подстрок (`description.includes('Коуч')`). После
 * локализации карточек на бэкенде описание приходит на языке пользователя —
 * испанец получает «Coach certificado…», подстрока не находится, и роль у всех
 * нерусских локалей сваливалась в дефолтную. id стабилен и не переводится.
 *
 * Один модуль на оба места сознательно: разошедшиеся копии этого хелпера уже
 * один раз довели баг до прода — вторая копия пережила исправление первой.
 *
 * Ассистента без записи здесь показываем с общей ролью — это осознанный дефолт,
 * а не ошибка: новый ассистент не должен ломать карточку.
 */
export const ROLE_KEY_BY_AGENT_ID: Record<number, string> = {
  1: 'chat.assistant_role_coach',
  2: 'chat.assistant_role_psych',
  3: 'chat.assistant_role_gameplay',
  9: 'chat.assistant_role_accountant',
  10: 'chat.assistant_role_lawyer',
  13: 'chat.assistant_role_astro',
  14: 'chat.assistant_role_hd',
};

export const getRoleForAssistant = (
  assistantId: number | string,
  t: (key: string) => string,
): string => t(ROLE_KEY_BY_AGENT_ID[Number(assistantId)] ?? 'chat.assistant_role_default');
