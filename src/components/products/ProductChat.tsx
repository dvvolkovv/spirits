import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Send } from 'lucide-react';
import { productsApi, Product } from '../../services/productsApi';
import type { Problem } from '../../services/productsApi';
import { TOPUP_HREF, formatRentAmount, wakeExpected } from './rent';
import { useAuth } from '../../contexts/AuthContext';

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
  const { t, i18n } = useTranslation();
  const lang = i18n?.language || 'ru';
  // Баланс берётся из уже идущего опроса AuthContext (раз в пять секунд).
  // Своего запроса здесь нет намеренно: второй опрос того же числа разъехался
  // бы с первым и показывал бы владельцу два разных баланса на одном экране.
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Отказ про деньги показывается вместе со ссылкой на пополнение: текста
  // «пополните баланс» без места, куда нажать, владельцу недостаточно.
  const [needsTopUp, setNeedsTopUp] = useState(false);

  /**
   * Причина отказа для человека — по КОДУ, а не одна на все случаи.
   *
   * До этой правки здесь стояло безусловное «агент уже работает над
   * предыдущим запросом»: apiClient.fetchStream отдавал null на любом не-2xx
   * и терял вместе с ним и код, и текст. Владелец с пустым балансом получал в
   * ответ на правку враньё про занятого агента и не имел ни одного способа
   * узнать правду — ни в интерфейсе, ни в консоли.
   *
   * 402 — деньги, и таких отказа у бэкенда два: спящий продукт
   * (SLEEPING_REFUSAL, turns.service.ts) и нулевой баланс. Различает их ТЕКСТ
   * СЕРВЕРА, поэтому он и показывается как есть: подменять его своим значило
   * бы вернуть ту же потерю, только на уровень выше. Своя строка остаётся
   * запасной — на случай, когда тела нет (502 от nginx приходит HTML-страницей).
   */
  const explain = (p: Problem): string => {
    if (p.status === 0) return t('products.new.errors.network');
    if (p.status === 402) return p.message || t('products.chat.sleeping');
    // 409 — замок product_turns_one_active: агент действительно занят. Теперь
    // это ОДИН случай, а не свалка из всех отказов сразу.
    if (p.status === 409) return p.message || t('products.chat.busy');
    // Глобального фильтра исключений на бэке нет: неперехваченная ошибка
    // приходит как {"message":"Internal server error"} — английская строка
    // фреймворка вместо объяснения.
    if (p.status >= 500) return t('products.chat.failed');
    return p.message || t('products.chat.failed');
  };

  const send = async () => {
    if (!prompt.trim() || streaming) return;
    setStreaming(true);
    setOutput('');
    setError(null);
    setNeedsTopUp(false);

    const started = await productsApi.chatStream(product.id, prompt);
    setPrompt('');

    if (!started.ok) {
      setError(explain(started));
      setNeedsTopUp(started.status === 402);
      setStreaming(false);
      return;
    }
    const reader = started.reader;

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
      {/*
        СПЯЩИЙ ПРОДУКТ: ОБЪЯСНЕНИЕ, А НЕ ЗАМОК.
        Поле ввода и кнопка остаются рабочими, и это решение, а не недоделка.
          - статус здесь — СНИМОК, сделанный в момент открытия продукта:
            ProductsSection держит выбранный продукт в состоянии и не
            перечитывает его. Продукт, разбуженный пять минут назад, в этом
            снимке всё ещё спит — погашенная кнопка заперла бы РАБОТАЮЩИЙ
            продукт без единого способа проверить, и владелец не отличил бы
            это от поломки;
          - истину про сон знает сервер, и теперь он её ДОГОВАРИВАЕТ: 402 с
            причиной доезжает до экрана. Запрет, поставленный поверх
            догадки, отнимает и это;
          - цена ошибок несимметрична. Лишняя отправка стоит одного запроса,
            который сервер отобьёт бесплатно (ход не ставится, токены не
            списываются); лишний запрет стоит правки, которую владелец не
            может сделать.
        Та же развилка и по той же причине уже решена в списке продуктов —
        предупреждение о молчащем сервере не запирает «Создать».
      */}
      {product.status === 'sleeping' && (
        <div className="flex flex-col gap-1.5 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <span className="font-medium">{t('products.status.sleeping')}</span>
          {wakeExpected(user?.tokens) ? (
            // Пополнение уже сделано: сервер подметает спящих раз в минуту,
            // дальше старт контейнера. Владельцу нужно знать, что ждать
            // осталось минуты, а не что делать что-то ещё.
            <span>{t('products.rent.waking')}</span>
          ) : (
            <>
              <span>{product.sleep_reason || t('products.rent.sleepingWhy')}</span>
              <span>{t('products.rent.wakeHint', { amount: formatRentAmount(lang) })}</span>
              <a
                href={TOPUP_HREF}
                className="self-start mt-0.5 px-4 py-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium"
              >
                {t('products.rent.topUp')}
              </a>
            </>
          )}
        </div>
      )}

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
        <div
          role="alert"
          className="flex flex-col gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
        >
          <span className="break-words">{error}</span>
          {needsTopUp && (
            // Ссылка, а не кнопка: отказ про деньги чинится ровно одним
            // действием, и оно за пределами этого экрана.
            <a
              href={TOPUP_HREF}
              className="self-start px-4 py-1.5 rounded-lg bg-forest-600 hover:bg-forest-700 text-white text-sm font-medium"
            >
              {t('products.rent.topUp')}
            </a>
          )}
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
