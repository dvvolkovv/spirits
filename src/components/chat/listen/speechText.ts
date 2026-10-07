// src/components/chat/listen/speechText.ts
import { askBlocksToPlainText } from '../../../utils/askBlock';

/**
 * Зеркала констант бэка — LISTEN_MAX_CHARS и tokenCostFor в
 * spirits_back/src/speech/speech.service.ts. Здесь они нужны только для
 * подсказки у кнопки до нажатия. Источник истины — бэк: при расхождении он
 * откажет (400) или спишет по своей формуле.
 */
export const LISTEN_MAX_CHARS = 10_000;

/** 1000 токенов за каждую начатую 1000 знаков. */
export const listenPrice = (chars: number): number => Math.ceil(chars / 1000) * 1000;

// Все выражения ниже — без вложенных и смежных неоднозначных повторов: разбор
// идёт прямо в рендере ленты, а катастрофический откат на битом теге
// (`\s*(…+?)\s*` у прежней регулярки ссылки) подвешивал вкладку на минуты.
// И без lookbehind: старый iOS Safari его не знает (см. askBlock.ts).

// Маркеры, которые бэк вклеивает в текст ради карточек видео и календаря.
const SERVICE_MARKER_RE = /\[(?:VIDEO_JOB|CALENDAR_PROPOSAL):[0-9a-f-]{36}\]/gi;
const CODE_FENCE_RE = /```[\s\S]*?```/g;
// Незакрытый блок кода (ответ оборвался) — читать его хвост бессмысленно.
const DANGLING_FENCE_RE = /```[\s\S]*$/;
// Ссылка и кнопка читаются надписью — её человек видит на экране.
const LINK_TAG_RE = /\{\{\s*link:([^|}]*)\|[^}]*\}\}/g;
const BUTTON_TAG_RE = /\{\{\s*button:([^|}]*)(?:\|[^}]*)?\}\}/g;
const ANY_TAG_RE = /\{\{[^}]*\}\}/g;
// Только известные теги: «x<y и y>z» и «<Tab>» — это текст, а не разметка.
const HTML_TAG_RE =
  /<\/?(?:a|b|blockquote|br|code|del|details|div|em|h[1-6]|hr|i|img|ins|kbd|li|mark|ol|p|pre|s|small|span|strong|sub|summary|sup|table|tbody|td|th|thead|tr|u|ul)\b[^>]*>/gi;
const ENTITY_RE = /&(#\d+|#x[0-9a-f]+|[a-z]+);/gi;
const ENTITIES: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  mdash: '—', ndash: '–', hellip: '…', laquo: '«', raquo: '»',
};
const IMAGE_RE = /!\[[^\]]*\]\([^)]*\)/g;
const LINK_RE = /\[([^\]]+)\]\([^)]*\)/g;
const URL_RE = /\bhttps?:\/\/\S+/g;
const INLINE_CODE_RE = /`([^`]+)`/g;
const ESCAPE_RE = /\\([\\`*_{}[\]()#+\-.!>|~])/g;
// Пиктограммы, флаги, тона кожи и склейки составных эмодзи. Альтернацией, а не
// одним классом: класс из модификаторов и склеек линтер справедливо считает
// обманчивым — в нём легко перепутать символ с последовательностью.
const EMOJI_RE = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[\u{1F3FB}-\u{1F3FF}]|\u200D|\uFE0F|\u20E3/gu;

const TABLE_DIVIDER_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;
const RULE_RE = /^([-*_]\s*){3,}$/;
const HEADING_RE = /^#{1,6}\s+/;
const HEADING_TAIL_RE = /\s+#+$/;
const QUOTE_RE = /^(>\s*)+/;
const BULLET_RE = /^[-*+•]\s+/;
// Звёздочки выделения: открывающие — после не-буквы перед текстом, закрывающие —
// после текста перед не-буквой. «2*3» (буквы и цифры с обеих сторон) остаётся.
const STAR_OPEN_RE = /(^|[^\p{L}\p{N}*])\*{1,3}(?=[^\s*])/gu;
const STAR_CLOSE_RE = /([^\s*])\*{1,3}(?=$|[^\p{L}\p{N}*])/gu;
const ITALIC_UNDERSCORE_RE = /(^|[^\p{L}\p{N}])_([^_]+)_(?=[^\p{L}\p{N}]|$)/gu;
const SENTENCE_END_RE = /[.!?…:;,]["»”’')\]]*$/;

function decodeEntity(whole: string, body: string): string {
  if (body[0] === '#') {
    const hex = body[1] === 'x' || body[1] === 'X';
    const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
  }
  return ENTITIES[body.toLowerCase()] ?? whole;
}

/**
 * Текст, который синтезатор прочтёт вслух: без разметки, служебных тегов,
 * адресов и эмодзи. Строка без знака конца предложения получает точку —
 * иначе пункты списка и заголовки слились бы в одну фразу без пауз. Абзацы
 * остаются переводами строки: по ним бэк режет длинный ответ на куски.
 *
 * Пустая строка — читать нечего (в ответе только картинка или плеер).
 */
export function toSpeechText(content: string): string {
  // Карточки вопросов — до вырезания блоков кода: они сами блок ```ask.
  const flat = askBlocksToPlainText(content)
    .replace(/\r\n?/g, '\n')
    .replace(SERVICE_MARKER_RE, ' ')
    .replace(CODE_FENCE_RE, '\n')
    .replace(DANGLING_FENCE_RE, '')
    .replace(LINK_TAG_RE, ' $1 ')
    .replace(BUTTON_TAG_RE, ' $1 ')
    .replace(ANY_TAG_RE, ' ')
    .replace(HTML_TAG_RE, ' ')
    .replace(ENTITY_RE, decodeEntity)
    .replace(IMAGE_RE, ' ')
    .replace(LINK_RE, '$1')
    .replace(URL_RE, ' ')
    .replace(INLINE_CODE_RE, '$1')
    .replace(ESCAPE_RE, '$1')
    .replace(EMOJI_RE, '');

  const lines: string[] = [];
  for (const raw of flat.split('\n')) {
    let line = raw.trim();
    if (!line || TABLE_DIVIDER_RE.test(line) || RULE_RE.test(line)) continue;
    if (HEADING_RE.test(line)) line = line.replace(HEADING_RE, '').replace(HEADING_TAIL_RE, '');
    line = line.replace(QUOTE_RE, '').replace(BULLET_RE, '');
    if (line.startsWith('|') || line.endsWith('|')) {
      line = line.split('|').map((cell) => cell.trim()).filter(Boolean).join(', ');
    }
    line = line
      .replace(/__|~~/g, '')
      .replace(STAR_OPEN_RE, '$1')
      .replace(STAR_CLOSE_RE, '$1')
      .replace(ITALIC_UNDERSCORE_RE, '$1$2')
      .replace(/[ \t\u00A0]+/g, ' ')
      .replace(/ ([.,!?;:…])/g, '$1')
      .trim();
    if (!line) continue;
    lines.push(SENTENCE_END_RE.test(line) ? line : `${line}.`);
  }
  return lines.join('\n');
}
