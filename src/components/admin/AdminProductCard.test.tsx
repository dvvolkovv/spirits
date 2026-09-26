// @vitest-environment jsdom
/**
 * Карточка продукта в разделе «Сайты и боты».
 *
 * Главное здесь — кнопки, которые гасят чужой бизнес: причина обязательна,
 * перед отправкой есть шаг подтверждения, уходит ровно то тело, что ждёт
 * существующая ручка (`{ key, reason }` и `{ key }`), а отказ сервера виден
 * его же словами. Всё это проверяется живым монтированием, а не чтением кода.
 */
import { act } from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRoot, Root } from 'react-dom/client';

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock('../../services/apiClient', () => ({ apiClient: { get, post } }));

import AdminProductCard from './AdminProductCard';
import type { AdminProductDetail } from './adminProducts';
import { makeRow, makeDetail, daysFromNow } from './adminProducts.fixtures';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const res = (status: number, body: unknown) =>
  Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });

const LONG_PROMPT =
  'Сделай кнопку записи крупнее и поменяй её цвет на зелёный, как у логотипа. ' +
  'А ещё добавь телефон в шапку сайта';

const DETAIL: AdminProductDetail = makeDetail({
  product: makeRow({
    id: 'p1',
    name: 'Кофейня',
    slug: 'coffee',
    status: 'sleeping',
    domain: 'coffee.c.linkeon.io',
    customDomain: { domain: 'xn--j1aefe.xn--p1ai', domainUnicode: 'кофе.рф', status: 'failed' },
    owner: { userId: '79001234567', name: 'Иван Петров', email: 'ivan@example.com' },
    host: { id: 'host-7', publicIp: '203.0.113.7' },
    paidUntil: daysFromNow(-2),
    sleepReason: 'Не хватило токенов на аренду',
    blockReason: 'Раньше гасили за спам',
    provisionError: 'Command failed: docker build\nstep 3/7: npm ci exited 1',
  }),
  domain: {
    domain: 'xn--j1aefe.xn--p1ai',
    domainUnicode: 'кофе.рф',
    names: ['кофе.рф', 'www.кофе.рф'],
    status: 'failed',
    error: 'Let’s Encrypt: too many certificates already issued',
    errorReason: 'issue_failed',
    checkedAt: '2026-09-25T10:00:00Z',
  },
  turns: [
    {
      id: 't1',
      channel: 'telegram',
      status: 'done',
      prompt: LONG_PROMPT,
      result: 'Готово: кнопка стала крупнее',
      tokensSpent: 5400,
      error: null,
      startedAt: '2026-09-25T10:00:00Z',
      finishedAt: '2026-09-25T10:03:00Z',
    },
    {
      id: 't2',
      channel: 'web',
      status: 'failed',
      prompt: 'Добавь оплату',
      result: null,
      tokensSpent: null,
      error: 'Ход оборван: продукт погашен администратором',
      startedAt: '2026-09-25T11:00:00Z',
      finishedAt: null,
    },
  ],
  jobs: [
    { id: 'j1', kind: 'sleep', status: 'failed', error: 'agent timeout', createdAt: '2026-09-25T12:00:00Z', finishedAt: null },
    { id: 'j2', kind: 'provision', status: 'done', error: null, createdAt: '2026-09-01T12:00:00Z', finishedAt: '2026-09-01T12:05:00Z' },
  ],
});

/**
 * Бэкенд с состоянием: гашение и снятие меняют статус, а следующее чтение
 * карточки это видит — как настоящий.
 */
let state: AdminProductDetail;
const detailUrl = '/webhook/admin/products/p1';

const backendGet = (url: string) => {
  if (url === detailUrl) return res(200, state);
  return Promise.reject(new Error(`неожиданный запрос ${url}`));
};
const backendPost = (url: string, body: { key: string; reason?: string }) => {
  if (url === '/webhook/products/block') {
    const was = state.product.status;
    state = { ...state, product: { ...state.product, status: 'blocked', blockReason: body.reason ?? null } };
    return res(200, { id: 'p1', slug: 'coffee', wasStatus: was, by: 'идентификатору', killedJobs: 1, killedTurns: 0 });
  }
  if (url === '/webhook/products/unblock') {
    state = { ...state, product: { ...state.product, status: 'sleeping', blockReason: null } };
    return res(200, { id: 'p1', slug: 'coffee', by: 'идентификатору', killedJobs: 0 });
  }
  return Promise.reject(new Error(`неожиданный запрос ${url}`));
};

let container: HTMLDivElement;
let root: Root;
const onClose = vi.fn();
const onChanged = vi.fn();

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

const mount = async () => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<AdminProductCard productId="p1" onClose={onClose} onChanged={onChanged} />);
  });
  await settle();
};

const q = (testid: string) => container.querySelector<HTMLElement>(`[data-testid="${testid}"]`);
const text = (testid: string) => q(testid)?.textContent ?? '';

const click = async (testid: string) => {
  const el = q(testid);
  if (!el) throw new Error(`нет элемента ${testid}`);
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await settle();
};

const typeInto = async (testid: string, value: string) => {
  const el = q(testid) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!el) throw new Error(`нет поля ${testid}`);
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const detailReads = () => get.mock.calls.filter((c) => c[0] === detailUrl).length;
const withStatus = (status: string, archivedAt: string | null = null) => {
  state = { ...DETAIL, product: { ...DETAIL.product, status, archivedAt } };
};

beforeEach(() => {
  state = DETAIL;
  get.mockReset();
  post.mockReset();
  onClose.mockReset();
  onChanged.mockReset();
  get.mockImplementation(backendGet);
  post.mockImplementation(backendPost);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe('содержимое карточки', () => {
  it('поля продукта: владелец, хост, адреса, причины сна и блокировки, ошибка заведения', async () => {
    await mount();
    const card = text('admin-product-card');
    expect(card).toContain('Кофейня');
    expect(card).toContain('coffee');
    expect(card).toContain('Иван Петров');
    expect(card).toContain('ivan@example.com');
    expect(card).toContain('79001234567');
    expect(card).toContain('203.0.113.7');
    expect(card).toContain('Не хватило токенов на аренду');
    expect(card).toContain('Раньше гасили за спам');
    expect(card).toContain('npm ci exited 1');
    expect(text('admin-product-card-status')).toBe('Спит');
    expect(q('admin-product-card-paid')!.getAttribute('data-overdue')).toBe('true');
  });

  it('блок своего домена: имя, имена сертификата, статус и ошибка', async () => {
    await mount();
    const domain = text('admin-product-domain');
    expect(domain).toContain('кофе.рф');
    expect(domain).toContain('www.кофе.рф');
    expect(domain).toContain('xn--j1aefe.xn--p1ai');
    expect(domain).toContain('Не получилось');
    expect(domain).toContain('too many certificates');
  });

  it('правки свёрнуты; «показать» раскрывает запрос и ответ, ошибка видна сразу', async () => {
    await mount();
    expect(text('admin-product-turn-t1')).toContain('Сделай кнопку записи');
    expect(text('admin-product-turn-t1')).not.toContain('телефон в шапку сайта');
    expect(text('admin-product-turn-t1')).not.toContain('Готово: кнопка стала крупнее');
    expect(text('admin-product-turn-t2')).toContain('Ход оборван: продукт погашен администратором');

    await click('admin-product-turn-toggle-t1');
    expect(text('admin-product-turn-t1')).toContain('телефон в шапку сайта');
    expect(text('admin-product-turn-t1')).toContain('Готово: кнопка стала крупнее');
    expect(text('admin-product-turn-toggle-t1')).toBe('скрыть');

    await click('admin-product-turn-toggle-t1');
    expect(text('admin-product-turn-t1')).not.toContain('Готово: кнопка стала крупнее');
    expect(text('admin-product-turn-toggle-t1')).toBe('показать');
  });

  it('у правки видны канал, статус и списанные токены', async () => {
    await mount();
    expect(q('admin-product-turn-t1')!.querySelector('[aria-label="Telegram"]')).not.toBeNull();
    expect(q('admin-product-turn-t2')!.querySelector('[aria-label="Веб"]')).not.toBeNull();
    expect(text('admin-product-turn-t1')).toContain('Готово');
    expect(text('admin-product-turn-t1')).toContain((5400).toLocaleString('ru-RU'));
    expect(text('admin-product-turn-t2')).toContain('Не выполнено');
  });

  it('задания: вид, статус и ошибка', async () => {
    await mount();
    expect(text('admin-product-job-j1')).toContain('Гашение');
    expect(text('admin-product-job-j1')).toContain('agent timeout');
    expect(text('admin-product-job-j2')).toContain('Заведение');
  });

  it('пустые списки и пустые поля не роняют карточку', async () => {
    state = {
      product: {
        ...makeRow({ id: 'p1', name: 'Пустой', status: 'provisioning' }),
        owner: null,
        host: null,
        domain: null,
        customDomain: null,
        paidUntil: null,
        tokensInPeriod: null,
      } as unknown as AdminProductDetail['product'],
      domain: null,
      turns: null,
      jobs: undefined,
    } as unknown as AdminProductDetail;
    await mount();
    const card = text('admin-product-card');
    expect(card).toContain('Пустой');
    expect(card).toContain('Правок нет');
    expect(card).toContain('Заданий нет');
    expect(card).toContain('Своего домена нет');
  });

  it('ошибка загрузки — текст сервера', async () => {
    get.mockImplementation(() => res(404, { statusCode: 404, message: 'Продукт не найден' }));
    await mount();
    expect(text('admin-product-card-error')).toContain('Продукт не найден');
  });
});

describe('кнопки по статусу', () => {
  it('у спящего — только «Погасить»', async () => {
    withStatus('sleeping');
    await mount();
    expect(q('admin-product-block')).not.toBeNull();
    expect(q('admin-product-unblock')).toBeNull();
  });

  it('у работающего — только «Погасить»', async () => {
    withStatus('running');
    await mount();
    expect(q('admin-product-block')).not.toBeNull();
    expect(q('admin-product-unblock')).toBeNull();
  });

  it('у погашенного — только «Снять блок»', async () => {
    withStatus('blocked');
    await mount();
    expect(q('admin-product-unblock')).not.toBeNull();
    expect(q('admin-product-block')).toBeNull();
  });

  it('у архивного — ни одной: сервер откажет в обоих', async () => {
    withStatus('blocked', '2026-09-20T00:00:00Z');
    await mount();
    expect(q('admin-product-unblock')).toBeNull();
    expect(q('admin-product-block')).toBeNull();
    expect(text('admin-product-card')).toContain('в архиве');
  });
});

describe('«Погасить»', () => {
  it('без причины не уходит: кнопка подтверждения неактивна', async () => {
    await mount();
    await click('admin-product-block');
    const confirm = q('admin-product-block-confirm') as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    await click('admin-product-block-confirm');
    await typeInto('admin-product-block-reason', '   ');
    expect((q('admin-product-block-confirm') as HTMLButtonElement).disabled).toBe(true);
    expect(post).not.toHaveBeenCalled();

    await typeInto('admin-product-block-reason', 'Фишинг');
    expect((q('admin-product-block-confirm') as HTMLButtonElement).disabled).toBe(false);
  });

  it('нажатие «Погасить» само по себе ничего не шлёт — сначала подтверждение', async () => {
    await mount();
    await click('admin-product-block');
    expect(post).not.toHaveBeenCalled();
    expect(q('admin-product-block-reason')).not.toBeNull();
  });

  it('уходит {key, reason}; видна строка результата; карточка и список перечитаны', async () => {
    await mount();
    expect(detailReads()).toBe(1);
    await click('admin-product-block');
    await typeInto('admin-product-block-reason', '  Фишинговая страница  ');
    await click('admin-product-block-confirm');

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/webhook/products/block', { key: 'p1', reason: 'Фишинговая страница' });
    const result = text('admin-product-action-result');
    expect(result).toContain('«coffee»');
    expect(result).toContain('спит');
    expect(result).toContain('оборвано правок: 0');
    expect(detailReads()).toBe(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
    // Перечитанная карточка уже погашена — и кнопка у неё другая.
    expect(text('admin-product-card-status')).toBe('Погашен');
    expect(q('admin-product-unblock')).not.toBeNull();
    expect(q('admin-product-block-reason')).toBeNull();
  });

  it('«Отмена» прячет форму и ничего не шлёт', async () => {
    await mount();
    await click('admin-product-block');
    await typeInto('admin-product-block-reason', 'Фишинг');
    await click('admin-product-block-cancel');
    expect(q('admin-product-block-reason')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('отказ сервера — его словами; причина не теряется, список не трогается', async () => {
    post.mockImplementation(() =>
      res(409, {
        statusCode: 409,
        message: 'У продукта только что появилось активное задание — гашение не выполнено, ничего не изменилось.',
      }));
    await mount();
    await click('admin-product-block');
    await typeInto('admin-product-block-reason', 'Фишинг');
    await click('admin-product-block-confirm');

    expect(text('admin-product-action-error')).toContain('гашение не выполнено, ничего не изменилось');
    expect((q('admin-product-block-reason') as HTMLTextAreaElement).value).toBe('Фишинг');
    expect(onChanged).not.toHaveBeenCalled();
    expect(q('admin-product-action-result')).toBeNull();
  });

  it('обрыв связи — понятная ошибка, а не тишина', async () => {
    post.mockImplementation(() => Promise.reject(new TypeError('Failed to fetch')));
    await mount();
    await click('admin-product-block');
    await typeInto('admin-product-block-reason', 'Фишинг');
    await click('admin-product-block-confirm');
    expect(text('admin-product-action-error')).toContain('Нет связи с сервером');
    expect(onChanged).not.toHaveBeenCalled();
  });

  it('два нажатия подряд шлют одно гашение', async () => {
    await mount();
    await click('admin-product-block');
    await typeInto('admin-product-block-reason', 'Фишинг');
    const confirm = q('admin-product-block-confirm')!;
    await act(async () => {
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      confirm.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await settle();
    expect(post).toHaveBeenCalledTimes(1);
  });
});

describe('«Снять блок»', () => {
  beforeEach(() => withStatus('blocked'));

  it('сначала подтверждение, потом уходит {key}; строка результата; перечитано', async () => {
    await mount();
    await click('admin-product-unblock');
    expect(post).not.toHaveBeenCalled();
    await click('admin-product-unblock-confirm');

    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith('/webhook/products/unblock', { key: 'p1' });
    expect(text('admin-product-action-result')).toContain('Блокировка снята');
    expect(text('admin-product-action-result')).toContain('«coffee»');
    expect(detailReads()).toBe(2);
    expect(onChanged).toHaveBeenCalledTimes(1);
    expect(text('admin-product-card-status')).toBe('Спит');
  });

  it('«Отмена» ничего не шлёт', async () => {
    await mount();
    await click('admin-product-unblock');
    await click('admin-product-unblock-cancel');
    expect(q('admin-product-unblock-confirm')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('отказ сервера — его словами', async () => {
    post.mockImplementation(() =>
      res(409, { statusCode: 409, message: 'Продукт «coffee» не блокирован (сейчас «sleeping») — снимать нечего.' }));
    await mount();
    await click('admin-product-unblock');
    await click('admin-product-unblock-confirm');
    expect(text('admin-product-action-error')).toContain('снимать нечего');
    expect(onChanged).not.toHaveBeenCalled();
  });
});

describe('закрытие', () => {
  it('крестиком', async () => {
    await mount();
    await click('admin-product-card-close');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('клавишей Escape', async () => {
    await mount();
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape в открытой форме гашения сначала закрывает форму, а не карточку', async () => {
    await mount();
    await click('admin-product-block');
    await act(async () => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(onClose).not.toHaveBeenCalled();
    expect(q('admin-product-block-reason')).toBeNull();
  });
});
