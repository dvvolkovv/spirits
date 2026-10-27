/**
 * Текст с адресами — куски для показа: обычный текст и ссылки.
 *
 * Поддержка показывает ответы простым текстом (SupportView), и адрес раздела
 * из ответа (https://my.linkeon.io/profile?open=zoom) не нажимался — человек
 * переписывал его руками. Ссылкой становится только http(s):// — javascript:,
 * data: и прочее остаются текстом — и только то, что разбирает URL. Знак
 * препинания вплотную за адресом — конец предложения, а не часть адреса.
 * Закрывающая скобка — часть адреса, только если открывающая тоже в нём
 * (…/wiki/Foo_(bar)).
 */
export type TextPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string };

const URL_RE = /https?:\/\/[^\s<>"'`«»]+/gi;
const TRAILING = /[.,;:!?…'"»”’]$/;

function trimTail(raw: string): string {
  let s = raw;
  for (;;) {
    if (TRAILING.test(s)) {
      s = s.slice(0, -1);
      continue;
    }
    const open = s.split('(').length - 1;
    const close = s.split(')').length - 1;
    if (s.endsWith(')') && close > open) {
      s = s.slice(0, -1);
      continue;
    }
    return s;
  }
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
