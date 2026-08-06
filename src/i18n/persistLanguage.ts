/**
 * Сохранение выбранного языка в профиль.
 *
 * Вынесено из компонента, чтобы поведение можно было проверить без DOM:
 * именно здесь раньше была дыра — запись делал только экран настроек, а
 * переключатель на экране входа язык в профиль не отправлял. Интерфейс при
 * этом честно менялся, поэтому дефект был не виден: ассистенты продолжали
 * отвечать на прежнем языке, и мобильное приложение его не подхватывало.
 */
export interface PersistLanguageDeps {
  /** Есть ли действующая сессия. Без неё писать некуда. */
  hasTokens: () => boolean;
  post: (url: string, body: unknown) => Promise<unknown>;
  onError?: (err: unknown) => void;
}

export const PROFILE_UPDATE_URL = '/webhook/profile-update';

/**
 * @returns `true`, если запись в профиль была отправлена.
 *
 * Неавторизованный пользователь — не ошибка: на экране входа аккаунта ещё
 * нет, язык лежит в localStorage, а в профиль его положит AuthContext сразу
 * после входа. Сетевая ошибка тоже не пробрасывается: язык уже переключён
 * локально, и падать из-за неудачной синхронизации нечему.
 */
export async function persistLanguage(
  lang: string,
  deps: PersistLanguageDeps,
): Promise<boolean> {
  if (!deps.hasTokens()) return false;
  try {
    await deps.post(PROFILE_UPDATE_URL, { language: lang });
    return true;
  } catch (err) {
    deps.onError?.(err);
    return false;
  }
}
