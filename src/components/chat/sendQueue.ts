/**
 * Очередь досылки: реплики, написанные пока ассистент отвечает.
 *
 * Параллельно отправить их нельзя — релей (relay-agent/server.mjs) убивает
 * предыдущий процесс `claude` при новом /chat на тот же sessionId, иначе два
 * `claude --resume <тот же id>` дерутся за JSONL-лок. Поэтому реплики копятся
 * здесь и уходят одним склеенным ходом после завершения текущего.
 *
 * Функции чистые и не мутируют вход: ChatInterface хранит очередь в useState,
 * и мутация на месте не вызвала бы ре-рендер.
 */

export interface QueuedMessage {
  id: string;
  text: string;
}

export function addToQueue(queue: QueuedMessage[], text: string, id: string): QueuedMessage[] {
  return [...queue, { id, text }];
}

export function removeFromQueue(queue: QueuedMessage[], id: string): QueuedMessage[] {
  return queue.filter((m) => m.id !== id);
}

/**
 * Склейка для отправки одним ходом. Пустая строка означает «слать нечего» —
 * вызывающий обязан проверить, иначе уйдёт пустой ход и спишутся токены.
 *
 * Этой же функцией текст возвращается в поле ввода при смене ассистента:
 * одна склейка на оба сценария, чтобы формат не разъехался.
 */
export function joinQueue(queue: QueuedMessage[]): string {
  return queue
    .map((m) => m.text.trim())
    .filter((t) => t.length > 0)
    .join('\n\n');
}
