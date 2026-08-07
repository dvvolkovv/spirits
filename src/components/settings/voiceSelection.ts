// src/components/settings/voiceSelection.ts
/** Переопределения голосов: имя ассистента → id голоса. */
export type VoiceSelection = Record<string, string>;

/**
 * Новое состояние выбора голосов.
 *
 * Ключ — ИМЯ ассистента (`agents.name`), а не числовой `id`: на бэкенде выбор
 * сверяется с колонкой `preferred_agent`, где лежит именно имя. С числовым id
 * совпадения не будет, и озвучка молча пойдёт дефолтным голосом — без ошибки,
 * поэтому поймать такое глазом в UI нельзя.
 *
 * Пустой `voiceId` = «по умолчанию»: ключ УДАЛЯЕТСЯ из объекта. Бэкенд мержит
 * `profile_data` оператором `||`, то есть заменяет `assistant_voices` целиком,
 * — значит отправка объекта без ключа и есть сброс переопределения.
 *
 * Вынесено из VoiceSettings.tsx отдельным модулем: чистую функцию так можно
 * тестировать без рендера, а react-refresh не ругается на не-компонентный
 * экспорт рядом с компонентом.
 */
export function nextVoiceSelection(
  current: VoiceSelection,
  assistantName: string,
  voiceId: string,
): VoiceSelection {
  const next = { ...current };
  if (voiceId) next[assistantName] = voiceId;
  else delete next[assistantName];
  return next;
}
