// src/utils/askBlock.ts
// Уточняющий вопрос ассистента — блок кода с языком `ask` и JSON внутри.
//
// Формат — контракт с бэком (spirits_back, chat/ask-rule.ts):
//   ```ask
//   {"questions":[{"header":"…","question":"…","multi":false,"options":["…","…"]}]}
//   ```
// Блок живёт в тексте сообщения, поэтому карточка восстанавливается из
// истории. Сырой JSON человек не видит никогда: недописанный блок (ответ ещё
// стримится) становится заглушкой, битый — обычным текстом.

export interface AskQuestion {
  question: string;
  header?: string;
  multi: boolean;
  options: string[];
}

export type AskBlock =
  | { kind: 'card'; questions: AskQuestion[] }
  | { kind: 'pending' }
  | { kind: 'fallback'; text: string };

const MAX_QUESTIONS = 3;
const MAX_OPTIONS = 4;
const OPEN_RE = /(^|\n)[ \t]*```[ \t]*ask[ \t]*\r?\n/i;
const CLOSE_RE = /(^|\r?\n)[ \t]*```[ \t]*(?=\r?\n|$)/;
// Во время стрима OPEN_RE ещё не совпадает, пока модель не дописала слово
// "ask" и перевод строки после него — а до этого момента в тексте виден сырой
// «```», «```a», «```as» или «```ask», который через мгновение исчезнет за
// карточкой. Эта строка — только в самом хвосте текста (иначе где-то
// «застрявшая» ```-строка посреди готового ответа пряталась бы навсегда) и
// только для префиксов именно слова "ask": другой язык (```js) — это не
// недописанный ask, а обычный код, его трогать нельзя.
const TRAILING_PARTIAL_OPEN_RE = /(^|\n)[ \t]*`{1,3}[ \t]*(?:a(?:s(?:k)?)?)?[ \t]*$/i;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

function toQuestion(raw: unknown): AskQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  const question = str(q.question);
  const options = Array.isArray(q.options)
    ? [...new Set(q.options.map(str).filter(Boolean))].slice(0, MAX_OPTIONS)
    : [];
  if (!question || options.length < 2) return null;
  const header = str(q.header);
  return { question, ...(header ? { header } : {}), multi: q.multi === true, options };
}

/** JSON блока → вопросы. null — если годного вопроса нет. */
export function parseAskJson(body: string): AskQuestion[] | null {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  const list = (data as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(list)) return null;
  const questions = list
    .map(toQuestion)
    .filter((q): q is AskQuestion => q !== null)
    .slice(0, MAX_QUESTIONS);
  return questions.length ? questions : null;
}

const unquote = (s: string): string => {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
};

/** Что удалось достать из битого блока: вопрос жирным и варианты списком. */
function askFallbackText(body: string): string {
  const qs = [...body.matchAll(/"question"\s*:\s*"((?:[^"\\]|\\.)*)"/g)];
  return qs
    .map((m, i) => {
      const from = m.index ?? 0;
      const to = i + 1 < qs.length ? qs[i + 1].index ?? body.length : body.length;
      const opts = /"options"\s*:\s*\[([^\]]*)\]/.exec(body.slice(from, to));
      const items = opts
        ? [...opts[1].matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((o) => `- ${unquote(o[1])}`)
        : [];
      return [`**${unquote(m[1])}**`, ...items].join('\n');
    })
    .join('\n\n');
}

/**
 * Заменяет блоки маркерами `__ASK_<n>__`, разобранное — в карте по n.
 * streaming: незакрытый блок — заглушка (дописывается); иначе он разбирается
 * до конца текста (модель не закрыла блок, но ответ уже готов).
 */
export function extractAskBlocks(
  content: string,
  opts: { streaming?: boolean } = {},
): { content: string; asks: Map<string, AskBlock> } {
  const asks = new Map<string, AskBlock>();
  let rest = content;
  let out = '';
  for (let n = 0; ; n++) {
    const open = OPEN_RE.exec(rest);
    if (!open) break;
    const id = String(n);
    out += `${rest.slice(0, open.index)}${open[1]}__ASK_${id}__`;
    const bodyStart = open.index + open[0].length;
    const tail = rest.slice(bodyStart);
    const close = CLOSE_RE.exec(tail);
    if (!close && opts.streaming) {
      asks.set(id, { kind: 'pending' });
      rest = '';
      break;
    }
    const body = close ? tail.slice(0, close.index) : tail;
    const questions = parseAskJson(body);
    asks.set(id, questions ? { kind: 'card', questions } : { kind: 'fallback', text: askFallbackText(body) });
    rest = close ? tail.slice(close.index + close[0].length) : '';
  }
  let result = out + rest;
  if (opts.streaming) {
    result = result.replace(TRAILING_PARTIAL_OPEN_RE, '$1');
  }
  return { content: result, asks };
}

/** Текст для копирования: вместо блоков — вопросы и варианты. */
export function askBlocksToPlainText(content: string): string {
  const { content: marked, asks } = extractAskBlocks(content);
  return marked.replace(/__ASK_(\d+)__/g, (_m, id: string) => {
    const b = asks.get(id);
    if (!b || b.kind === 'pending') return '';
    if (b.kind === 'fallback') return b.text;
    return b.questions.map((q) => [q.question, ...q.options.map((o) => `- ${o}`)].join('\n')).join('\n\n');
  });
}
