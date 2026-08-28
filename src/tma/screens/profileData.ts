import { downscaleImage } from '../../utils/downscaleImage';
/**
 * Логика экрана «Профиль» (Task 12), вынесенная из JSX ради тестов без
 * рендера React-дерева.
 *
 * GET /webhook/profile отдаёт МАССИВ `[{ profileJson: {...} }]`
 * (profile.service.ts getProfile), со старым форматом `profile_data` как
 * запасным вариантом для обратной совместимости — именно так уже разбирает
 * ответ основной веб-профиль (components/profile/ProfileView.tsx). Плановое
 * `r?.profile_data ?? r` не учитывало ни массив, ни поле profileJson.
 *
 * `birthday` — поле, которого раньше нигде не было (ни в бэке, ни в вебе).
 * Технически это безопасно: profile-update мержит ЛЮБЫЕ ключи в свободный
 * JSONB profile_data (profile.service.ts updateProfile — только entity-поля
 * вроде values/beliefs вырезаются в Neo4j, остальное проходит как есть), но
 * это значит, что ключ существует только в контракте Mini App, и веб-профиль
 * его не показывает.
 */
export interface ProfileFields {
  name: string;
  birthday: string;
  language: string | null;
}

export function extractProfile(raw: unknown): ProfileFields {
  const record = Array.isArray(raw) ? raw[0] : raw;
  const data = (record as any)?.profileJson ?? (record as any)?.profile_data ?? record ?? {};
  return {
    name: typeof data.name === 'string' ? data.name : '',
    birthday: typeof data.birthday === 'string' ? data.birthday : '',
    language: typeof data.language === 'string' ? data.language : null,
  };
}

export interface ProfileSaveDeps {
  postJson: (url: string, body: unknown) => Promise<unknown>;
  changeLanguage: (lang: string) => Promise<unknown>;
}

/**
 * Язык обязан уйти в теле сохранения: это то же поле profile_data.language,
 * которое читают ассистенты при ответе (см. CLAUDE.md), поэтому смена языка
 * на этом экране должна долетать до сервера, а не оставаться только в i18n.
 */
export async function saveProfile(
  fields: ProfileFields,
  deps: ProfileSaveDeps,
): Promise<void> {
  await deps.postJson('/webhook/profile-update', {
    name: fields.name,
    birthday: fields.birthday,
    language: fields.language,
  });
  if (fields.language) await deps.changeLanguage(fields.language);
}

export interface AvatarUploadDeps {
  /** Обязан быть putForm (multipart), а не apiClient.put (жёстко JSON.stringify). */
  putForm: (url: string, body: FormData) => Promise<unknown>;
  getAvatarBlob: () => Promise<Blob | null>;
}

/**
 * Аватар — PUT multipart с полем `file` (avatar.controller.ts: multer
 * `.single('file')`), не JSON. После успешной загрузки перечитываем
 * GET /webhook/avatar — он отдаёт БАЙТЫ картинки или 204, а не
 * `{avatar_url}`, поэтому getJson здесь не подходит (см. api.ts getBlob).
 */
export async function uploadAvatar(file: File, deps: AvatarUploadDeps): Promise<Blob | null> {
  const body = new FormData();
  // Уменьшаем перед отправкой: сервер картинки не обрабатывает и потом
  // отдаёт ровно то, что мы загрузили, — в мобильный WebView это уезжало
  // мегабайтами (см. downscaleImage).
  //
  // Имя файла подменяем ТОЛЬКО когда реально пережали: downscaleImage
  // возвращает исходный File, если уменьшать нечего, и FormData.append с
  // третьим аргументом завернул бы его в новый File с чужим именем.
  const prepared = await downscaleImage(file);
  if (prepared === file) body.append('file', file);
  else body.append('file', prepared, 'avatar.jpg');
  await deps.putForm('/webhook/avatar', body);
  return deps.getAvatarBlob();
}
