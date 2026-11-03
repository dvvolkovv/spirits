/**
 * Сообщение, отклонённое на нулевом балансе (бэклог 2d71aaf8).
 *
 * С 03.11 на нулевом балансе бэк всё равно отвечает текстом остановки (в нём
 * уже ссылка на пополнение), но в событии `end` присылает `reason:
 * 'no_tokens'` — само сообщение при этом никуда не записано. Кабинет без
 * этого признака оставлял пузырь человека в ленте до перезагрузки и терял
 * текст (а при вложениях — и файлы) после перехода на оплату.
 *
 * Чистые функции отсюда разбирают это ОДНО условие и склейку текста;
 * подключение в ChatInterface.tsx (где убрать пузырь, куда вернуть текст,
 * когда сохранить черновик) проверяет noTokensWiring.test.ts отдельно, по
 * тексту исходника: ChatInterface огромный, и юнит-тест этих двух функций не
 * заметит, если их забыли позвать из одной из двух точек разбора потока.
 */

/** Минимальная форма события `end` — ровно то, что нужно для признака. */
interface EndEventLike {
  type?: string;
  reason?: string;
}

/** Нулевой баланс: ход не оплачен, сообщение не записано бэком. */
export function isNoTokensEnd(event: EndEventLike | null | undefined): boolean {
  return event?.type === 'end' && event?.reason === 'no_tokens';
}

/**
 * Отклонённый текст — назад в поле ввода.
 *
 * Пустое поле — просто текст; уже что-то набрано — дописываем через пустую
 * строку, как и подстановка очереди при смене ассистента (returnQueueToInput
 * в ChatInterface.tsx, которая теперь сама зовёт эту функцию). Пустой (или
 * из одних пробелов) rejected — поле не трогаем вовсе.
 */
export function restoreIntoInput(current: string, rejected: string): string {
  if (!rejected.trim()) return current;
  return current.trim() ? `${current}\n\n${rejected}` : rejected;
}

/**
 * Минимальная форма сообщения ленты, нужная чистым функциям ниже — реальный
 * Message из ChatInterface.tsx ей структурно соответствует (там полей
 * больше), generic M сохраняет точный тип при проходе через filter/slice.
 */
export interface ChatMessageLike {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  /** Это — сообщение-остановка на нулевом балансе (ревью Ф1, m1): следующее
   *  такое же его заменяет, а не дублирует. */
  noTokensStop?: boolean;
}

/**
 * Пузырь `rejectedId` убран из ленты, а если ПОСЛЕДНИМ (сразу после этого)
 * остаётся предыдущее сообщение-остановка (noTokensStop) — оно тоже убрано:
 * два отказа подряд показывают ОДНО сообщение остановки, а не два одинаковых
 * (ревью Ф1, m1). Обычный (успешный) ответ перед отклонённым пузырём не
 * трогается — лента хранит реальную историю.
 *
 * `rejectedId` может не встретиться ни у одного сообщения — тогда просто
 * дописывает: синтетический ход (приветствие/регенерация/служебный промпт)
 * не заводит отдельного пузыря человека, но дедуп повторной остановки всё
 * равно должен работать (C1).
 */
export function collapseNoTokensStop<M extends ChatMessageLike>(
  messages: M[],
  rejectedId: string,
  stopMessage: M,
): M[] {
  const withoutRejected = messages.filter((m) => m.id !== rejectedId);
  const last = withoutRejected[withoutRejected.length - 1];
  const withoutPriorStop = last?.noTokensStop ? withoutRejected.slice(0, -1) : withoutRejected;
  return [...withoutPriorStop, stopMessage];
}

export interface ApplyNoTokensOutcomeArgs {
  /** Текст, который бэк отклонил (для очереди — уже склеенный вызывающим). */
  rejectedText: string;
  /** Текущее содержимое поля ввода. */
  currentInput: string;
  /**
   * Склеенный текст очереди, скопившейся за время ЭТОГО хода ('' — очереди
   * нет). Ревью Ф1, m2: очередь не должна досылаться следом в заведомо
   * нулевой баланс — вызывающий забирает её текст сюда и чистит очередь сам.
   */
  queuedText: string;
}

export interface NoTokensOutcome {
  /** Новое содержимое поля ввода. */
  input: string;
  /**
   * Текст для черновика (сейчас всегда равен input). Отдельное поле — на
   * случай, если формат черновика когда-нибудь разойдётся с видимым полем.
   * Длиннее PENDING_DRAFT_STORE_MAX (2000 знаков) savePendingDraft молча не
   * сохранит (ревью Ф1, m5) — это решение модуля pendingDraft, не этой
   * функции: видимое поле ввода при этом получает текст целиком.
   */
  draftText: string;
}

/**
 * Текст для поля ввода и черновика после отказа на нулевом балансе —
 * отклонённое сообщение плюс всё, что скопилось в очереди за время хода
 * (ревью Ф1, m2), склеенные тем же приёмом, что и подстановка в непустое
 * поле (restoreIntoInput).
 *
 * Вызывающий зовёт эту функцию ТОЛЬКО когда ход инициирован человеком
 * напрямую (есть id его пузыря) — иначе (автоприветствие, «Перегенерировать»,
 * служебный промпт с файлом) в поле/черновик уехал бы не текст человека, а
 * синтетический промпт (бэклог 2d71aaf8, Critical из ревью Ф1 — C1).
 */
export function applyNoTokensOutcome(args: ApplyNoTokensOutcomeArgs): NoTokensOutcome {
  const queued = args.queuedText.trim();
  const combined = queued ? `${args.rejectedText}\n\n${queued}` : args.rejectedText;
  const input = restoreIntoInput(args.currentInput, combined);
  return { input, draftText: input };
}
