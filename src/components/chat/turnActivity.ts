// Шаги работы ассистента за один ход — то, что показывается вместо трёх точек.
//
// Бэкенд присылает события {type:'activity', kind, detail?} (spirits_back,
// chat/activity-map.ts). Здесь — чистая логика: склейка повторов, отметка
// «сделано», итог хода. Отрисовка — ActivitySteps.tsx.

/** Коды шагов — контракт с бэком (activity-map.ts, ActivityKind). */
export const ACTIVITY_KINDS = [
  'web_search', 'web_fetch', 'read_upload', 'read_file', 'write_file', 'search_files',
  'compute', 'image_generate', 'image_edit', 'video', 'speech', 'calendar_read',
  'calendar_propose', 'routine', 'notes', 'messages_read', 'message_send',
  'mail_read', 'mail_send', 'product', 'find_files', 'other',
] as const;

export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

export interface ActivityStep {
  kind: ActivityKind;
  detail?: string;
  /** Сколько раз подряд пришёл тот же шаг: «Обрабатываю данные ×6». */
  count: number;
  /**
   * Шаг закончился. Успешно ли — неизвестно: результатов инструментов релей
   * не присылает. Поэтому и отметка на экране нейтральная.
   */
  done: boolean;
}

export interface TurnActivity {
  startedAt: number;
  steps: ActivityStep[];
}

/** Итог хода. Живёт у завершённого сообщения только в памяти. */
export interface ActivitySummary {
  steps: ActivityStep[];
  durationMs: number;
}

export function startActivity(at: number): TurnActivity {
  return { startedAt: at, steps: [] };
}

export function normalizeKind(kind: unknown): ActivityKind {
  return (ACTIVITY_KINDS as readonly string[]).includes(kind as string) ? (kind as ActivityKind) : 'other';
}

const closeLast = (steps: ActivityStep[]): ActivityStep[] => {
  const last = steps[steps.length - 1];
  return last && !last.done ? [...steps.slice(0, -1), { ...last, done: true }] : steps;
};

/** Пришёл шаг: предыдущий сделан, повтор того же — счётчик. */
export function addStep(a: TurnActivity, kind: unknown, detail?: unknown): TurnActivity {
  const k = normalizeKind(kind);
  const d = typeof detail === 'string' && detail.trim() ? detail.trim() : undefined;
  const last = a.steps[a.steps.length - 1];
  if (last && last.kind === k && last.detail === d) {
    return { ...a, steps: [...a.steps.slice(0, -1), { ...last, count: last.count + 1, done: false }] };
  }
  return { ...a, steps: [...closeLast(a.steps), { kind: k, detail: d, count: 1, done: false }] };
}

/** Пошёл текст ответа: текущий шаг закончился. Без изменений — тот же объект. */
export function markTextStarted(a: TurnActivity): TurnActivity {
  const steps = closeLast(a.steps);
  return steps === a.steps ? a : { ...a, steps };
}

/** Ход закончился. Без шагов итога нет: «Думал 8 с» над каждым ответом — шум. */
export function finishActivity(a: TurnActivity, at: number): ActivitySummary | undefined {
  if (a.steps.length === 0) return undefined;
  return {
    steps: a.steps.map((s) => (s.done ? s : { ...s, done: true })),
    durationMs: Math.max(0, at - a.startedAt),
  };
}

export function durationParts(ms: number): { m: number; s: number } {
  const total = Math.max(0, Math.round(ms / 1000));
  return { m: Math.floor(total / 60), s: total % 60 };
}
