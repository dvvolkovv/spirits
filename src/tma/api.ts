import { apiClient } from '../services/apiClient';

/**
 * Тонкий слой над apiClient: экраны Mini App работают с JSON, а apiClient
 * отдаёт Response. Без этого хелпера каждый экран повторял бы разбор тела и
 * проверку статуса по-своему — и расходился бы в обработке ошибок.
 *
 * Неуспешный статус — исключение: экраны ловят его и показывают своё
 * состояние ошибки, а не молча рисуют пустоту.
 */
async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export async function getJson<T = any>(url: string): Promise<T> {
  return parse<T>(await apiClient.get(url));
}

export async function postJson<T = any>(url: string, data?: unknown): Promise<T> {
  return parse<T>(await apiClient.post(url, data));
}

/** apiClient.put не умеет FormData — он всегда делает JSON.stringify. */
export async function putForm<T = any>(url: string, body: FormData): Promise<T> {
  return parse<T>(await apiClient.request(url, { method: 'PUT', body }));
}

/**
 * GET, отдающий бинарные байты, а не JSON — сейчас единственный такой:
 * /webhook/avatar отдаёт либо сами байты картинки (Content-Type: image/...),
 * либо 204 без тела, если аватар не выставлен. parse<T>() из getJson здесь
 * не подходит: res.json() на бинарном теле или на пустом 204 бросает.
 *
 * @returns null на 204 (аватара нет) или на неуспешном статусе — для экрана
 * профиля отсутствие аватара не ошибка, а обычное состояние.
 */
export async function getBlob(url: string): Promise<Blob | null> {
  const res = await apiClient.get(url);
  if (res.status === 204 || !res.ok) return null;
  return res.blob();
}

/**
 * Потоковый POST: результат приходит частями, а не одним ответом.
 *
 * Нужен поиску людей и разбору совместимости — обе ручки отдают NDJSON по
 * мере готовности, как в основном приложении. Дожидаться конца потока и
 * показывать всё разом было бы проще, но поиск идёт десятки секунд, и всё
 * это время экран оставался бы пустым. В телеграме, где приложение открывают
 * с телефона на плохом канале, пустой экран читается как «зависло».
 *
 * Строки разбираются по одной: сервер шлёт по объекту на строку, и последний
 * кусок почти всегда обрывается на половине — поэтому хвост остаётся в
 * буфере до следующего чтения.
 *
 * @param onChunk зовётся на каждый разобранный объект. Исключение внутри него
 *   не рвёт чтение: один битый элемент не повод терять остальную выдачу.
 */
export async function postStream(
  url: string,
  data: unknown,
  onChunk: (item: any) => void,
): Promise<void> {
  const res = await apiClient.post(url, data);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const reader = res.body?.getReader();
  // Тела нет вовсе — не ошибка сети, а пустая выдача: пусть экран покажет
  // «никого не нашлось», а не красное сообщение о сбое.
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      const s = line.trim();
      if (!s) continue;
      try {
        onChunk(JSON.parse(s));
      } catch {
        // Не JSON — пропускаем молча: сервер иногда пишет служебные строки.
      }
    }
  }
  // Хвост без перевода строки в конце — последний объект выдачи.
  const tail = buffer.trim();
  if (tail) {
    try { onChunk(JSON.parse(tail)); } catch { /* см. выше */ }
  }
}
