// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, clickAsync, doubleClick, flush, actAsync, type, byButton, visibleText, tRu } from '../../test/dom';
import { ProductActionCard } from './ProductActionCard';
import { productActionsApi } from '../../services/productActionsApi';
import type { ProductActionView } from '../../services/productActionsApi';

vi.mock('react-i18next', async () => {
  const { tRu: t } = await import('../../test/dom');
  return { useTranslation: () => ({ t, i18n: { language: 'ru' } }) };
});
vi.mock('../../services/productActionsApi', () => ({
  productActionsApi: { get: vi.fn(), submit: vi.fn(), cancel: vi.fn() },
  isProblem: (x: any) => x?.ok === false,
}));
const api = vi.mocked(productActionsApi);

const view = (over: Partial<ProductActionView> = {}): ProductActionView => ({
  id: 'a1', kind: 'delete', status: 'pending', productId: 'p1', productName: 'Магазин', keyNames: [],
  expiresAt: '2026-10-25T10:30:00.000Z', restoreUntil: '2026-11-24T10:00:00.000Z', result: null, ...over,
});

describe('карточка действия продукта', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('удаление: заголовок и дата возврата; «Удалить» шлёт confirm', async () => {
    api.get.mockResolvedValue(view());
    api.submit.mockResolvedValue(view({ status: 'done', result: { restoreUntil: '2026-11-24T10:00:00.000Z' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.delete.title', { name: 'Магазин' }));
    await clickAsync(byButton(container, new RegExp(tRu('products.action.delete.confirm')))!);
    expect(api.submit).toHaveBeenCalledWith('a1', { confirm: true, via: 'chat' });
    expect(visibleText(container)).toContain(tRu('products.action.delete.done', { name: 'Магазин', date: '24 ноября' }));
  });

  it('бот: без токена не отправляет; с токеном — ключи уходят в set, поля очищаются', async () => {
    api.get.mockResolvedValue(view({ kind: 'create_bot', productId: null, productName: 'Бот' }));
    api.submit.mockResolvedValue(view({ kind: 'create_bot', status: 'done', productName: 'Бот', result: { productId: 'p9', botUsername: 'b' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="tma" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
    expect(api.submit).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.action.createBot.tokenRequired'));
    const token = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement;
    type(token, '123:abc');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
    expect(api.submit).toHaveBeenCalledWith('a1', { set: { BOT_TOKEN: '123:abc' }, via: 'tma' });
    expect(container.querySelector('[data-testid="product-action-token"]')).toBeNull();
  });

  it('ошибка, которую можно поправить, — на месте, карточка ждёт', async () => {
    api.get.mockResolvedValue(view({ kind: 'create_bot', result: { error: 'Telegram не принял токен' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain('Telegram не принял токен');
  });

  it('срок вышел и не найдено — свои тексты', async () => {
    api.get.mockResolvedValue(view({ status: 'expired' }));
    const a = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(a.container)).toContain(tRu('products.action.expired'));
    api.get.mockResolvedValue({ ok: false, status: 404, message: '' } as any);
    const b = mount(<ProductActionCard actionId="a2" via="chat" />);
    await flush();
    expect(visibleText(b.container)).toContain(tRu('products.action.notFound'));
  });

  // Доп. к задаче: загрузка отказала не 404-м (обрыв связи, 5xx, что угодно
  // ещё) — это не «такого действия нет», а временный сбой. Своя надпись и
  // кнопка «Повторить», которая просто перечитывает карточку заново.
  it('обрыв связи при загрузке — «не удалось», повтор перечитывает карточку', async () => {
    api.get.mockResolvedValueOnce({ ok: false, status: 0, message: '' } as any);
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.loadFailed'));
    expect(visibleText(container)).not.toContain(tRu('products.action.notFound'));

    api.get.mockResolvedValueOnce(view());
    await clickAsync(byButton(container, new RegExp(tRu('products.action.retry')))!);
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(visibleText(container)).toContain(tRu('products.action.delete.title', { name: 'Магазин' }));
  });

  it('500 при загрузке — та же надпись «не удалось», а не «не найдено»', async () => {
    api.get.mockResolvedValue({ ok: false, status: 500, message: 'boom' } as any);
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.loadFailed'));
    expect(byButton(container, new RegExp(tRu('products.action.retry')))).not.toBeNull();
  });

  // Доп. к задаче: отказ ОТПРАВКИ (а не загрузки) разбирается по статусу —
  // 429 и обрыв связи получают свой текст, а не общее «не удалось, причина:».
  it('429 при отправке — «слишком часто»', async () => {
    api.get.mockResolvedValue(view());
    api.submit.mockResolvedValue({ ok: false, status: 429, message: '' } as any);
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.delete.confirm')))!);
    expect(visibleText(container)).toContain(tRu('products.action.tooOften'));
  });

  it('обрыв связи при отправке — «нет соединения»', async () => {
    api.get.mockResolvedValue(view());
    api.submit.mockResolvedValue({ ok: false, status: 0, message: '' } as any);
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.delete.confirm')))!);
    expect(visibleText(container)).toContain(tRu('products.action.network'));
  });

  // Доп. к задаче: пока действие «в работе», карточка сама дотягивает исход —
  // человек не обновляет страницу вручную, чтобы увидеть «готово».
  it('working: опрашивает каждые 3 секунды и останавливается, когда статус меняется', async () => {
    vi.useFakeTimers();
    api.get
      .mockResolvedValueOnce(view({ status: 'working' }))
      .mockResolvedValueOnce(view({ status: 'working' }))
      .mockResolvedValue(view({ status: 'done', result: { restoreUntil: '2026-11-24T10:00:00.000Z' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.working'));
    expect(api.get).toHaveBeenCalledTimes(1);

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.get).toHaveBeenCalledTimes(2);
    expect(visibleText(container)).toContain(tRu('products.action.working'));

    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(api.get).toHaveBeenCalledTimes(3);
    expect(visibleText(container)).toContain(tRu('products.action.delete.done', { name: 'Магазин', date: '24 ноября' }));

    // Статус уже не working — дальше опроса нет.
    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });
    expect(api.get).toHaveBeenCalledTimes(3);
  });

  it('working: опрос гасится после 20 попыток, даже если статус не меняется', async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(view({ status: 'working' }));
    mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    for (let i = 0; i < 25; i += 1) {
      await actAsync(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
    }
    // 1 начальная загрузка + не больше 20 попыток опроса.
    expect(api.get).toHaveBeenCalledTimes(21);
  });

  it('working: опрос останавливается после размонтирования карточки', async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(view({ status: 'working' }));
    const { unmount } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    unmount();
    await actAsync(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  // Доп. к задаче: два клика подряд, до перерисовки — замок по ссылке
  // (не только disabled в разметке), иначе второй клик проходит мимо.
  it('двойной клик подряд шлёт подтверждение один раз', async () => {
    api.get.mockResolvedValue(view());
    api.submit.mockResolvedValue(view({ status: 'done', result: { restoreUntil: '2026-11-24T10:00:00.000Z' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    const btn = byButton(container, new RegExp(tRu('products.action.delete.confirm')))!;
    doubleClick(btn);
    await flush();
    expect(api.submit).toHaveBeenCalledTimes(1);
  });
});
