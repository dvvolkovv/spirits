import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { productsApi, Product } from '../../services/productsApi';

export type StreamEvent =
  | { type: 'begin' }
  | { type: 'item'; content: string }
  | { type: 'tool_start'; tool: string; input?: unknown }
  | { type: 'tool_result'; tool: string; result?: unknown }
  | { type: 'end'; usage?: { total?: number } }
  | { type: 'error'; message: string };

/**
 * Разбирает NDJSON-поток хода. Вынесено из компонента, чтобы поведение
 * потока можно было проверить: чанк режет JSON посередине, и без буфера
 * такое событие теряется целиком.
 */
export async function consumeTurnStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onEvent: (e: StreamEvent) => void,
): Promise<void> {
  const decoder = new TextDecoder();
  // Хвост последнего чтения, который ещё не завершился '\n' — событие
  // могло разорваться границей чанка, поэтому оно копится тут, а не
  // разбирается сразу.
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    // Последний элемент — либо пустая строка (если чанк закончился на \n),
    // либо неполная строка, разорванная границей чтения. В обоих случаях
    // её рано разбирать — придерживаем до следующего чтения.
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        onEvent(JSON.parse(line) as StreamEvent);
      } catch {
        // Мусорная строка не должна ронять разбор всего потока.
      }
    }
  }

  // Поток закрылся — то, что осталось в буфере, пришло без завершающего
  // '\n'. Именно так чаще всего приходит последнее событие хода (end или
  // error): если его не разобрать здесь, клиент останется в состоянии
  // «ход идёт» навсегда.
  if (buffer.trim()) {
    try {
      onEvent(JSON.parse(buffer) as StreamEvent);
    } catch {
      // Мусорный хвост — не наша забота, ход всё равно уже закрыт.
    }
  }
}

interface Props {
  product: Product;
  onTurnFinished: () => void;
}

export const ProductChat: React.FC<Props> = ({ product, onTurnFinished }) => {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!prompt.trim() || streaming) return;
    setStreaming(true);
    setOutput('');
    setError(null);

    const reader = await productsApi.chatStream(product.id, prompt);
    setPrompt('');

    if (!reader) {
      // fetchStream отдаёт null на любом не-2xx, и статус там теряется.
      // Самый частый случай — 409: на продукт действует замок «один ход
      // одновременно», и агент ещё занят предыдущим запросом.
      setError(t('products.chat.busy'));
      setStreaming(false);
      return;
    }

    let accumulated = '';
    try {
      await consumeTurnStream(reader, (event) => {
        if (event.type === 'item') {
          accumulated += event.content;
          setOutput(accumulated);
        } else if (event.type === 'tool_start') {
          accumulated += `\n\n_${event.tool}_\n`;
          setOutput(accumulated);
        } else if (event.type === 'error') {
          setError(event.message);
        }
      });
    } finally {
      // Даже если поток оборвался, состояние обязано вернуться: иначе поле
      // ввода останется заблокированным навсегда.
      setStreaming(false);
      onTurnFinished();
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={t('products.chat.placeholder')}
          disabled={streaming}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-forest-500 disabled:bg-gray-50 disabled:text-gray-400"
        />
        <button
          onClick={send}
          disabled={streaming || !prompt.trim()}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-forest-600 hover:bg-forest-700 disabled:bg-gray-300 text-white font-medium text-sm shadow-md hover:shadow-lg disabled:shadow-none transition-all duration-200"
        >
          <Send size={16} /> {t('products.chat.send')}
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {(output || streaming) && (
        <div className="px-4 py-3 rounded-xl bg-white border border-gray-200 text-sm text-gray-800 whitespace-pre-wrap">
          {output}
          {streaming && <span className="inline-block w-1.5 h-4 bg-gray-400 ml-0.5 animate-pulse align-middle" />}
        </div>
      )}
    </div>
  );
};
