import { isUuid } from './uuid';

// Блок, который сервер дописывает к ответу ассистента (product-action-tail.ts):
// ```product-action\n{"id":"…"}\n```
//
// Распознавание здесь СТРОГОЕ — ровно та форма, в которой сервер пишет блок,
// без пробела между бэктиками и именем тега (в отличие от либерального
// server-side stripProductActionBlocks в product-action-tail.ts, который
// обязан вырезать блок в любой неряшливой форме, какую мог бы сочинить сам
// ответ модели). Модель блок product-action не пишет вообще — это не её
// формат, — и сервер уже вычищает любой похожий мусор из текста модели до
// того, как допишет свой; так что сюда может доехать только блок ровно в
// каноничной форме.
const BLOCK_RE = /(^|\n)[ \t]*```product-action[ \t]*\r?\n([\s\S]*?)\r?\n[ \t]*```[ \t]*(?=\r?\n|$)/g;

/**
 * Блоки карточек → маркеры __PACTION_n__, id — в карту. Блок с негодным id
 * исчезает без карточки: сочинить блок модель не может, но мусору не место в
 * тексте.
 *
 * Повтор одного и того же id (сервер по гонке/ретраю дописал блок дважды)
 * даёт только ОДНУ карточку: первое вхождение становится маркером, все
 * следующие блоки с тем же id исчезают без маркера — иначе пользователь
 * увидел бы две одинаковые карточки на одно и то же действие.
 */
export function extractProductActions(content: string): { content: string; actions: Map<string, string> } {
  const actions = new Map<string, string>();
  const seen = new Set<string>();
  let n = 0;
  const out = content.replace(BLOCK_RE, (_m: string, lead: string, body: string) => {
    let id: unknown = null;
    try {
      id = JSON.parse(body.trim())?.id;
    } catch {
      id = null;
    }
    if (!isUuid(id)) return lead;
    if (seen.has(id)) return lead;
    seen.add(id);
    const key = String(n++);
    actions.set(key, id);
    return `${lead}__PACTION_${key}__`;
  });
  return { content: out, actions };
}

export function stripProductActionBlocks(content: string): string {
  return content.replace(BLOCK_RE, (_m: string, lead: string) => lead);
}
