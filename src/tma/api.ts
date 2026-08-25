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
