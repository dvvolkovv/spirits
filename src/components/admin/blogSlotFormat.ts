/**
 * Когда выйдет одобренный пост — та же фраза, что владелец получает в
 * Telegram после апрува («Одобрено. Опубликую в пятницу, 25 сентября, в
 * 10:00 МСК.»): «в четверг, 24 сентября, в 10:00 МСК» / «сегодня в 10:00
 * МСК» / «завтра в 10:00 МСК».
 *
 * Порт `spirits_back/src/blog/blog-slot-format.ts`. Правила держать
 * синхронно с ним: расхождение здесь — это две разные даты у одного поста,
 * в админке и в личке бота.
 *
 * Почему не `Intl.DateTimeFormat('ru-RU', …)` — по той же причине, что на
 * бэке: после предлога «в» нужен винительный падеж («в среду», не «в
 * среда») и чередование предлога («во вторник»), а Intl отдаёт только
 * именительный. Таблица падежей нужна в любом случае, и Intl ничего не
 * упрощает.
 *
 * Время строго московское, а не браузерное: админку открывают откуда угодно,
 * а слот задан «по Москве». Поэтому никаких `getDate()`/`getHours()` и
 * `toLocaleString()` без пояса — они отдают часы браузера. Москва весь год
 * UTC+3 без перевода часов (та же посылка, что в бэковом `blog-slots.ts`),
 * так что московские компоненты — это UTC-компоненты момента, сдвинутого на
 * три часа вперёд.
 */

const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;

/**
 * ISO-нумерация дня недели (1 = понедельник … 7 = воскресенье) → готовый
 * фрагмент «в <день недели в винительном падеже>» с правильным предлогом.
 */
const WEEKDAY_IN: Record<number, string> = {
  1: 'в понедельник',
  2: 'во вторник',
  3: 'в среду',
  4: 'в четверг',
  5: 'в пятницу',
  6: 'в субботу',
  7: 'в воскресенье',
};

/** Название месяца в родительном падеже: «24 сентября», не «24 сентябрь». */
const MONTH_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

interface MskParts {
  year: number;
  month: number; // 0-based, как у Date
  day: number;
  isoDow: number; // 1..7
  hour: number;
  minute: number;
}

function toMskParts(d: Date): MskParts {
  const shifted = new Date(d.getTime() + MSK_OFFSET_MS);
  const isoDow = shifted.getUTCDay() === 0 ? 7 : shifted.getUTCDay();
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(),
    day: shifted.getUTCDate(),
    isoDow,
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

const sameMskDate = (a: MskParts, b: MskParts): boolean =>
  a.year === b.year && a.month === b.month && a.day === b.day;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * @param slot момент публикации (`slotAt` поста — UTC)
 * @param now момент, относительно которого решаем «сегодня/завтра». Явный
 *   параметр, как и на бэке: иначе функцию не проверить без мока времени.
 */
export function formatSlotWhen(slot: Date, now: Date): string {
  const slotParts = toMskParts(slot);
  const nowParts = toMskParts(now);
  const time = `${pad2(slotParts.hour)}:${pad2(slotParts.minute)} МСК`;

  if (sameMskDate(slotParts, nowParts)) return `сегодня в ${time}`;

  // Сутки в Москве всегда 24 часа — перевода часов нет, так что «плюс
  // сутки» и есть следующая московская дата.
  const tomorrowParts = toMskParts(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  if (sameMskDate(slotParts, tomorrowParts)) return `завтра в ${time}`;

  const weekday = WEEKDAY_IN[slotParts.isoDow];
  const month = MONTH_GENITIVE[slotParts.month];
  return `${weekday}, ${slotParts.day} ${month}, в ${time}`;
}

/**
 * То же для строки из API. Неразборчивую строку отдаёт как есть: лучше
 * показать сырое значение, чем «в undefined, NaN undefined».
 */
export function formatSlotAt(iso: string, now: Date): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatSlotWhen(d, now);
}
