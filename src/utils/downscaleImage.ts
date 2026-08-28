/**
 * Уменьшение картинки перед загрузкой на сервер.
 *
 * Зачем: бэкенд хранит и отдаёт аватар как есть, обрабатывать картинки не
 * умеет (ни sharp, ни jimp в зависимостях нет). На проде это вылилось в
 * GET /webhook/avatar на 3,98 МБ в мобильном WebView Telegram — столько же,
 * сколько весил исходник с телефона.
 *
 * Оговорка: это чинит будущие загрузки. Уже загруженные тяжёлые аватары
 * останутся такими, пока человек не заменит фото — для них нужна серверная
 * миниатюра.
 */

/**
 * Аватар показывается кружком 64×64 CSS-пикселя; 512 с запасом хватает даже
 * на экраны с тройной плотностью. Всё, что больше, — мегабайты трафика ради
 * невидимой разницы.
 */
export const MAX_AVATAR_SIDE = 512;

export function computeTargetSize(width: number, height: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= MAX_AVATAR_SIDE) return { width, height };
  const k = MAX_AVATAR_SIDE / longest;
  return { width: width * k, height: height * k };
}

/**
 * Возвращает исходный файл без изменений, если уменьшать нечего или браузер
 * не дал canvas-контекст: лучше загрузить тяжёлый аватар, чем не загрузить
 * никакой.
 */
export async function downscaleImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file;
  }

  const { width, height } = computeTargetSize(bitmap.width, bitmap.height);
  if (width === bitmap.width && height === bitmap.height) return file;

  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width);
  canvas.height = Math.round(height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

  return new Promise<Blob>((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? file), 'image/jpeg', 0.85);
  });
}
