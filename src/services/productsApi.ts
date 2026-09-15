import { apiClient } from './apiClient';

export type ProductKind = 'site' | 'bot';

export interface Product {
  id: string;
  name: string;
  slug: string;
  // 'failed' — сорванное заведение. Словарь в 002_provisioning.sql, и он
  // ЦЕЛИКОМ перечислен там же; без этого значения карточка отказа красится
  // как неизвестный статус и остаётся без кнопки «повторить».
  status: 'provisioning' | 'running' | 'degraded' | 'stopped' | 'archived' | 'failed';
  domain: string | null;
  runner_seen_at: string | null;
  created_at: string;
  /**
   * Причина последнего сорванного заведения. Приходит с машины продуктов,
   * бывает длинной и технической (`Command failed: docker build …` со
   * stderr) — на бэкенде у неё намеренно нет потолка длины.
   *
   * Необязательное, хотя с 036c6a7 колонка есть в перечислении COLUMNS
   * (products.service.ts): причина заполняется только у сорванного
   * заведения, у остальных строк там NULL. Карточка отказа обязана пережить
   * и отсутствие поля — и старый бэкенд, и отказ, о котором никто не
   * отчитался (сборщик зависших ставит failed без причины).
   */
  provision_error?: string | null;
  /** Форма продукта. Как и provision_error, приезжает с 036c6a7. */
  kind?: ProductKind;
}

/** Тело кнопки «Создать» — ровно то, что принимает CreateProductDto на бэке. */
export interface NewProductInput {
  name: string;
  slug: string;
  kind: ProductKind;
  secrets: Record<string, string>;
}

/**
 * Итог операции, меняющей состояние.
 *
 * Не `boolean` и не голый `Response`: вызывающему нужны и код (409 «слаг
 * занят» отличается от 400 «слаг не той формы» и от обрыва сети), и текст
 * причины с сервера. Разложить их обязан именно этот слой — компонент не
 * должен знать, что тело ошибки Nest выглядит как `{ message }`.
 */
export type Problem = { ok: false; status: number; message: string };
export type MutationResult = { ok: true } | Problem;

/**
 * Достаёт человеческую причину из тела ответа.
 *
 * `status: 0` — сюда не попадает, это код обрыва (см. create/retry).
 * Тело может не быть JSON вообще: 502 от nginx приходит HTML-страницей, и
 * `res.json()` на ней бросает. Тогда причина остаётся пустой, а код —
 * настоящий: компонент подставит свою формулировку.
 */
async function problem(res: Response): Promise<Problem> {
  let message = '';
  try {
    const body = (await res.json()) as { message?: unknown } | null;
    const m = body?.message;
    // ValidationPipe отдаёт message МАССИВОМ строк (по одной на нарушенное
    // правило DTO). String(['a','b']) дал бы 'a,b' — склеиваем явно.
    message = Array.isArray(m) ? m.join('; ') : typeof m === 'string' ? m : '';
  } catch {
    // Не JSON — пустая причина честнее выдуманной.
  }
  return { ok: false, status: res.status, message };
}

export interface Turn {
  id: string;
  channel: 'web' | 'telegram';
  prompt: string;
  result: string | null;
  status: 'queued' | 'running' | 'done' | 'failed' | 'reverted';
  sha_before: string | null;
  sha_after: string | null;
  /** Непустое => это служебный ход отката, а не запрос к агенту. */
  revert_to_sha: string | null;
  tokens_spent: number;
  error: string | null;
  created_at: string;
  finished_at: string | null;
}

// Значения id приходят с бэкенда, но экранируем их сами: слэш в id незаметно
// увёл бы запрос на чужой маршрут, а экранировать дешевле, чем доказывать,
// что туда ничего подобного не попадёт.
const enc = encodeURIComponent;

export const productsApi = {
  /**
   * Список продуктов текущего пользователя.
   *
   * `null` — «не удалось», `[]` — «продуктов нет». Разница не косметическая.
   * Прежде оба случая отдавали `[]`, и одна мигнувшая 502 посреди заведения
   * (рестарт API при выкате, протухший токен, опрос раз в пять секунд все
   * десять минут срока) стирала список: экран объявлял «продуктов нет», в
   * нём не оставалось заводящихся, опрос снимался — и не возобновлялся до
   * перезагрузки вкладки. Заведение при этом шло своим ходом.
   *
   * Разбор тела тоже в try: на этом хостинге SPA-фолбэк отдаёт 200 с HTML на
   * любой путь, и `res.json()` на такой странице бросает. Без перехвата
   * отказ улетал бы необработанным промисом прямо из обработчика кнопки.
   */
  async list(): Promise<Product[] | null> {
    try {
      const res = await apiClient.get('/webhook/products');
      if (!res.ok) {
        return null;
      }
      const rows = await res.json();
      // 200 с HTML (SPA-фолбэк) разбирается не всегда ошибкой: пустая
      // страница может дать и не-массив. Список обязан быть списком.
      return Array.isArray(rows) ? (rows as Product[]) : null;
    } catch {
      return null;
    }
  },

  /**
   * Заводит продукт: кнопка «Создать» в форме нового продукта.
   *
   * Секреты уезжают ТЕЛОМ POST-а, а не в адресе: адрес попадает в лог nginx,
   * в историю браузера и в Referer. Тело — не попадает никуда, кроме сервера.
   *
   * Наружу возвращается только id: открытый токен раннера бэкенд браузеру не
   * отдаёт принципиально (см. products.controller.ts).
   */
  async create(input: NewProductInput): Promise<{ ok: true; id: string } | Problem> {
    let res: Response;
    try {
      res = await apiClient.post('/webhook/products', input);
    } catch {
      // apiClient пробрасывает обрыв сети и неудачу refresh наружу. Без этого
      // перехвата отказ вылетел бы из обработчика кнопки необработанным
      // промисом: форма осталась бы без объяснения, а кнопка — заблокированной
      // ровно так, как выглядит зависание.
      return { ok: false, status: 0, message: '' };
    }
    if (!res.ok) {
      return problem(res);
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body?.id ?? '' };
  },

  /**
   * Повторяет сорванное заведение. Бэкенд переиспользует ту же строку
   * продукта: слаг, имя, форма и секреты сохраняются (см. retry() в
   * provisioning.service.ts), поэтому спрашивать что-либо заново не нужно.
   */
  async retry(productId: string): Promise<MutationResult> {
    let res: Response;
    try {
      res = await apiClient.post(`/webhook/products/${enc(productId)}/retry`);
    } catch {
      return { ok: false, status: 0, message: '' };
    }
    if (!res.ok) {
      return problem(res);
    }
    return { ok: true };
  },

  /** История ходов продукта (50 последних, отдаёт бэкенд). */
  async turns(productId: string): Promise<Turn[]> {
    const res = await apiClient.get(`/webhook/products/${enc(productId)}/turns`);
    if (!res.ok) {
      return [];
    }
    return res.json();
  },

  /** Откат продукта к состоянию до выбранного хода. */
  async revert(productId: string, turnId: string): Promise<Response> {
    return apiClient.post(`/webhook/products/${enc(productId)}/turns/${enc(turnId)}/revert`);
  },

  /**
   * Ставит ход агента и открывает поток событий (NDJSON).
   *
   * Обычный post отдал бы клиенту всё разом в конце хода (минуты) либо
   * оборвался бы по таймауту прокси — поэтому именно fetchStream.
   */
  chatStream(productId: string, prompt: string) {
    return apiClient.fetchStream(`/webhook/products/${enc(productId)}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  },
};
