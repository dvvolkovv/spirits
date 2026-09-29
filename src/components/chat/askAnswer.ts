// src/components/chat/askAnswer.ts
import type { AskQuestion } from '../../utils/askBlock';

/** Выбор по одному вопросу карточки. */
export interface AskPick {
  selected: string[];
  /** «Свой вариант» — текст поля; пустая строка, если не заполнено. */
  custom: string;
}

const NONE: AskPick = { selected: [], custom: '' };

export const emptyPicks = (n: number): AskPick[] =>
  Array.from({ length: n }, () => ({ selected: [], custom: '' }));

function answersOf(q: AskQuestion, p: AskPick): string[] {
  const custom = p.custom.trim();
  if (!q.multi) return custom ? [custom] : p.selected.slice(0, 1);
  return custom ? [...p.selected, custom] : p.selected;
}

/** На каждый вопрос есть ответ — можно отправлять. */
export function isAskComplete(questions: AskQuestion[], picks: AskPick[]): boolean {
  return questions.every((q, i) => answersOf(q, picks[i] ?? NONE).length > 0);
}

/**
 * Текст ответа — обычное сообщение пользователя.
 * Один вопрос: «Коллеге» / «Тёплый, С юмором». Несколько — строка на вопрос:
 * «<header или вопрос>: <выбранное>». По этому же формату parseAskAnswer
 * восстанавливает подсветку после перезагрузки.
 */
export function buildAskAnswer(questions: AskQuestion[], picks: AskPick[]): string {
  const parts = questions.map((q, i) => answersOf(q, picks[i] ?? NONE).join(', '));
  if (questions.length === 1) return parts[0];
  return questions.map((q, i) => `${q.header || q.question}: ${parts[i]}`).join('\n');
}

function matchOptions(q: AskQuestion, segment: string): string[] {
  const s = segment.trim();
  const items = s.split(', ');
  return q.options.filter((o) => s === o || items.includes(o));
}

/** Какие варианты выбраны в уже отправленном ответе. Не узнали — пусто. */
export function parseAskAnswer(questions: AskQuestion[], answer: string): string[][] {
  if (questions.length === 1) return [matchOptions(questions[0], answer)];
  const lines = answer.split('\n');
  return questions.map((q) => {
    const prefix = `${q.header || q.question}: `;
    const line = lines.find((l) => l.startsWith(prefix));
    return line ? matchOptions(q, line.slice(prefix.length)) : [];
  });
}
