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
