/**
 * Текст с адресами — куски для показа: обычный текст и ссылки.
 *
 * Поддержка показывает ответы простым текстом (SupportView), и адрес раздела
 * из ответа (https://my.linkeon.io/profile?open=zoom) не нажимался — человек
 * переписывал его руками. Ссылкой становится только http(s):// — javascript:,
 * data: и прочее остаются текстом — и только то, что разбирает URL. Знак
 * препинания вплотную за адресом — конец предложения, а не часть адреса.
 * Закрывающая скобка — часть адреса, только если открывающая тоже в нём
 * (…/wiki/Foo_(bar), …?a[0]=1).
 */
export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

// Пунктуация CJK (U+3000–U+303F) и полноширинные формы (U+FF00–U+FF65) адрес
// обрывают: китайский и японский текст идёт без пробела, и «…?open=zoom。然后»
// иначе целиком стал бы адресом. Иероглифы, кана и полуширинная катакана (с
// U+FF66) — часть адреса: https://zh.wikipedia.org/wiki/北京.
const URL_RE = /https?:\/\/[^\s<>"'`«»\u3000-\u303F\uFF00-\uFF65]+/gi;
// Те же знаки за адресом, что срезает GFM-автоссылка в чате, — и разметка
// вокруг него (**адрес**, _адрес_, ~~адрес~~).
const TRAILING = /[.,;:!?…'"»”’*_~]$/;

const count = (s: string, ch: string): number => s.split(ch).length - 1;

/** Закрывающая скобка в конце без пары внутри адреса — знак текста, а не адреса. */
const unpaired = (s: string, open: string, close: string): boolean =>
  s.endsWith(close) && count(s, close) > count(s, open);

function trimTail(raw: string): string {
  let s = raw;
  while (TRAILING.test(s) || unpaired(s, '(', ')') || unpaired(s, '[', ']')) s = s.slice(0, -1);
  return s;
}

export function linkifyText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let at = 0;
  for (const m of text.matchAll(URL_RE)) {
    const start = m.index ?? 0;
    const raw = trimTail(m[0]);
    let href: string | null = null;
    try {
      const u = new URL(raw);
      if (u.protocol === 'http:' || u.protocol === 'https:') href = u.href;
    } catch {
      /* не адрес — останется текстом */
    }
    if (!href) continue;
    if (start > at) parts.push({ kind: 'text', text: text.slice(at, start) });
    parts.push({ kind: 'link', text: raw, href });
    at = start + raw.length;
  }
  if (at < text.length) parts.push({ kind: 'text', text: text.slice(at) });
  return parts;
}
