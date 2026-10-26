// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mount, click, clickAsync, doubleClick, flush, actAsync, type, byButton, visibleText, tRu } from '../../test/dom';
import { ProductActionCard } from './ProductActionCard';
import { productActionsApi } from '../../services/productActionsApi';
import type { ProductActionView } from '../../services/productActionsApi';
import { EXTRA_SECRETS_MAX } from './secretNames';

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

  // Находка ревью: cleanup эффекта `aliveRef.current = false` без тела,
  // поднимающего флаг обратно, застревал на «Загрузка…» ровно под StrictMode
  // (снятие — заход снова, и второй заход флаг уже не поднимал).
  it('StrictMode: двойной вызов эффектов не держит карточку на «Загрузка…» навсегда', async () => {
    api.get.mockResolvedValue(view());
    const { container } = mount(
      <React.StrictMode>
        <ProductActionCard actionId="a1" via="chat" />
      </React.StrictMode>,
    );
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.delete.title', { name: 'Магазин' }));
  });

  // Находка ревью: смена actionId должна сбросить поля предыдущей карточки
  // (токен, ключи) и не дать ответу, ушедшему ДО смены, применить себя после.
  describe('смена actionId', () => {
    it('сбрасывает токен и ключи предыдущей карточки', async () => {
      api.get.mockResolvedValueOnce(view({ kind: 'create_bot', productId: null, productName: 'Бот' }));
      const { container, rerender } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      const token = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement;
      type(token, '123:abc');
      expect(token.value).toBe('123:abc');

      api.get.mockResolvedValueOnce(view({ id: 'a2', kind: 'create_bot', productId: null, productName: 'Другой бот' }));
      rerender(<ProductActionCard actionId="a2" via="chat" />);
      await flush();
      const token2 = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement;
      expect(token2.value).toBe('');
      expect(visibleText(container)).toContain(tRu('products.action.createBot.title', { name: 'Другой бот' }));
    });

    it('ответ, ушедший за старый actionId до смены, не применяется после неё', async () => {
      let resolveFirst: ((v: ProductActionView) => void) | undefined;
      api.get.mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }));
      api.get.mockResolvedValueOnce(view({ id: 'a2', kind: 'create_bot', productId: null, productName: 'Бот' }));
      const { container, rerender } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      expect(visibleText(container)).toContain(tRu('products.action.loading'));

      rerender(<ProductActionCard actionId="a2" via="chat" />);
      await flush();
      expect(visibleText(container)).toContain(tRu('products.action.createBot.title', { name: 'Бот' }));

      resolveFirst?.(view({ id: 'a1' }));
      await flush();
      expect(visibleText(container)).toContain(tRu('products.action.createBot.title', { name: 'Бот' }));
      expect(visibleText(container)).not.toContain(tRu('products.action.delete.title', { name: 'Магазин' }));
    });
  });

  // Находка ревью: опрос «в работе» не должен копить параллельные запросы,
  // должен останавливаться после потолка попыток и давать способ продолжить.
  describe('опрос «в работе»', () => {
    it('не отправляет новый тик, пока предыдущий запрос ещё не ответил', async () => {
      vi.useFakeTimers();
      let resolveTick: ((v: ProductActionView) => void) | undefined;
      api.get
        .mockResolvedValueOnce(view({ status: 'working' }))
        .mockImplementationOnce(() => new Promise((res) => { resolveTick = res; }));
      mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      expect(api.get).toHaveBeenCalledTimes(1);

      await actAsync(async () => { await vi.advanceTimersByTimeAsync(3000); });
      // Первый тик ушёл и подвешен.
      expect(api.get).toHaveBeenCalledTimes(2);

      await actAsync(async () => { await vi.advanceTimersByTimeAsync(3000); });
      // Второй тик не отправил новый запрос: предыдущий всё ещё в полёте.
      expect(api.get).toHaveBeenCalledTimes(2);

      api.get.mockResolvedValue(view({ status: 'working' }));
      resolveTick?.(view({ status: 'working' }));
      await flush();
      await actAsync(async () => { await vi.advanceTimersByTimeAsync(3000); });
      // Ответ пришёл — опрос продолжает отправлять тики.
      expect(api.get).toHaveBeenCalledTimes(3);
    });

    it('после 20 попыток показывает «Проверить снова», и кнопка перезапускает опрос', async () => {
      vi.useFakeTimers();
      api.get.mockResolvedValue(view({ status: 'working' }));
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      for (let i = 0; i < 21; i += 1) {
        // 1 начальная загрузка + 20 тиков опроса — после этого опрос гасится.
        await actAsync(async () => { await vi.advanceTimersByTimeAsync(3000); });
      }
      expect(api.get).toHaveBeenCalledTimes(21);
      const again = byButton(container, new RegExp(tRu('products.action.checkAgain')));
      expect(again).not.toBeNull();

      api.get.mockResolvedValueOnce(view({ status: 'working' }));
      await clickAsync(again!);
      expect(api.get).toHaveBeenCalledTimes(22);

      // Опрос перезапустился заново (свежий счётчик попыток): следующий тик
      // через 3 с снова стучится, а не молчит, как молчал бы погашенный.
      api.get.mockResolvedValueOnce(view({ status: 'done', result: { restoreUntil: '2026-11-24T10:00:00.000Z' } }));
      await actAsync(async () => { await vi.advanceTimersByTimeAsync(3000); });
      expect(api.get).toHaveBeenCalledTimes(23);
      expect(visibleText(container)).toContain(tRu('products.action.delete.done', { name: 'Магазин', date: '24 ноября' }));
    });
  });

  // Находка ревью: тексты по виду действия — «готово» и «ожидание» не должны
  // молча показывать текст бота/удаления там, где вид действия другой.
  it('виды действия без формы — свой текст на «готово» и на «ожидание»', async () => {
    api.get.mockResolvedValueOnce(view({ kind: 'restore', status: 'done' }));
    const a = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(a.container)).toContain(tRu('products.action.doneGeneric'));

    api.get.mockResolvedValueOnce(view({ kind: 'revert', status: 'pending' }));
    const b = mount(<ProductActionCard actionId="a2" via="chat" />);
    await flush();
    expect(visibleText(b.container)).toContain(tRu('products.action.notACard'));

    api.get.mockResolvedValueOnce(view({ kind: 'keys', status: 'pending' }));
    const c = mount(<ProductActionCard actionId="a3" via="chat" />);
    await flush();
    expect(visibleText(c.container)).toContain(tRu('products.action.keys.unsupported'));
  });

  // Находка ревью: fmt() падал бы на NaN-дате без проверки — заведённого
  // разбора в карточке больше не должно бросать исключение.
  it('дата возврата: битая строка не роняет карточку, просто не показывается', async () => {
    api.get.mockResolvedValue(view());
    api.submit.mockResolvedValue(view({ status: 'done', result: { restoreUntil: 'не-дата' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.delete.confirm')))!);
    expect(visibleText(container)).toContain(tRu('products.action.delete.done', { name: 'Магазин', date: '' }));
  });

  // Находка ревью: отказ отправки разбирался не по всем кодам (404 показывал
  // бы английский текст сервера), а «без причины» давал повисшее «причина:».
  describe('тексты отказа', () => {
    it('404 при отправке — «не найдено», а не английский текст сервера', async () => {
      api.get.mockResolvedValue(view());
      api.submit.mockResolvedValue({ ok: false, status: 404, message: 'Action not found' } as any);
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      await clickAsync(byButton(container, new RegExp(tRu('products.action.delete.confirm')))!);
      expect(visibleText(container)).toContain(tRu('products.action.notFound'));
      expect(visibleText(container)).not.toContain('Action not found');
    });

    it('«failed» без причины — общее «не получилось», без повисшего «причина:»', async () => {
      api.get.mockResolvedValue(view({ status: 'failed', result: null }));
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      expect(visibleText(container)).toContain(tRu('products.action.failedGeneric'));
    });

    it('отказ отправки без текста сервера — то же общее «не получилось»', async () => {
      api.get.mockResolvedValue(view());
      api.submit.mockResolvedValue({ ok: false, status: 400, message: '' } as any);
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      await clickAsync(byButton(container, new RegExp(tRu('products.action.delete.confirm')))!);
      expect(visibleText(container)).toContain(tRu('products.action.failedGeneric'));
    });
  });

  // Находка ревью: строки «Дополнительных ключей» не чистили свою ошибку на
  // правку/удаление, не ограничивали себя потолком и не гасли во время busy.
  describe('дополнительные ключи бота', () => {
    it('правка или удаление строки снимает её прежнюю ошибку', async () => {
      api.get.mockResolvedValue(view({ kind: 'create_bot', productId: null, productName: 'Бот' }));
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      const token = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement;
      type(token, '123:abc');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
      const nameInput = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
      type(nameInput, '1bad');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
      expect(api.submit).not.toHaveBeenCalled();
      expect(container.querySelectorAll('[role="alert"]').length).toBeGreaterThan(0);

      type(nameInput, 'GOOD_NAME');
      expect(container.querySelectorAll('[role="alert"]').length).toBe(0);
    });

    it('кнопка «Добавить ключ» прячется на потолке EXTRA_SECRETS_MAX', async () => {
      api.get.mockResolvedValue(view({ kind: 'create_bot', productId: null, productName: 'Бот' }));
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      const add = () => byButton(container, new RegExp(tRu('products.action.createBot.addKey')));
      for (let i = 0; i < EXTRA_SECRETS_MAX; i += 1) {
        const btn = add();
        expect(btn).not.toBeNull();
        click(btn!);
      }
      expect(add()).toBeNull();
      expect(container.querySelectorAll('[data-testid="product-action-secret-value"]').length).toBe(EXTRA_SECRETS_MAX);
    });

    it('поля недоступны во время отправки', async () => {
      api.get.mockResolvedValue(view({ kind: 'create_bot', productId: null, productName: 'Бот' }));
      let resolveSubmit: ((v: ProductActionView) => void) | undefined;
      api.submit.mockImplementation(() => new Promise((res) => { resolveSubmit = res; }));
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      const token = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement;
      type(token, '123:abc');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
      expect(token.disabled).toBe(true);
      const nameInput = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
      expect(nameInput.disabled).toBe(true);
      resolveSubmit?.(view({ kind: 'create_bot', status: 'done', productName: 'Бот', result: { productId: 'p9', botUsername: 'b' } }));
      await flush();
    });

    it('строка BOT_TOKEN, повтор имени и имя без значения — блокируют отправку', async () => {
      api.get.mockResolvedValue(view({ kind: 'create_bot', productId: null, productName: 'Бот' }));
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      const token = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement;
      type(token, '123:abc');

      // Строка с именем BOT_TOKEN — токен уже свой, строка блока не должна перебить его.
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
      const name1 = container.querySelectorAll('input[type="text"]')[0] as HTMLInputElement;
      const value1 = container.querySelectorAll('[data-testid="product-action-secret-value"]')[0] as HTMLInputElement;
      type(name1, 'BOT_TOKEN');
      type(value1, 'x');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
      expect(api.submit).not.toHaveBeenCalled();

      // Повтор имени во второй строке.
      type(name1, 'API_KEY');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
      const name2 = container.querySelectorAll('input[type="text"]')[1] as HTMLInputElement;
      const value2 = container.querySelectorAll('[data-testid="product-action-secret-value"]')[1] as HTMLInputElement;
      type(name2, 'API_KEY');
      type(value2, 'y');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
      expect(api.submit).not.toHaveBeenCalled();

      // Имя без значения.
      type(name2, 'OTHER_KEY');
      type(value2, '');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
      expect(api.submit).not.toHaveBeenCalled();

      // Поправленные строки — отправка проходит, и обе уходят в set рядом с токеном.
      type(value2, 'y');
      api.submit.mockResolvedValue(view({ kind: 'create_bot', status: 'done', productName: 'Бот', result: { productId: 'p9', botUsername: 'b' } }));
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
      expect(api.submit).toHaveBeenCalledWith('a1', { set: { API_KEY: 'x', OTHER_KEY: 'y', BOT_TOKEN: '123:abc' }, via: 'chat' });
    });

    it('пустая строка (без имени и без значения) не уходит в set', async () => {
      api.get.mockResolvedValue(view({ kind: 'create_bot', productId: null, productName: 'Бот' }));
      api.submit.mockResolvedValue(view({ kind: 'create_bot', status: 'done', productName: 'Бот', result: { productId: 'p9', botUsername: 'b' } }));
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      const token = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement;
      type(token, '123:abc');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
      expect(api.submit).toHaveBeenCalledWith('a1', { set: { BOT_TOKEN: '123:abc' }, via: 'chat' });
    });

    it('отправка вернула pending с ошибкой — текст на месте, форма осталась, токен не стирается', async () => {
      api.get.mockResolvedValue(view({ kind: 'create_bot', productId: null, productName: 'Бот' }));
      api.submit.mockResolvedValue(view({ kind: 'create_bot', status: 'pending', productName: 'Бот', result: { error: 'Telegram не принял токен' } }));
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
      await flush();
      const token = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement;
      type(token, '123:abc');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
      expect(visibleText(container)).toContain('Telegram не принял токен');
      const after = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement | null;
      expect(after).not.toBeNull();
      expect(after!.value).toBe('123:abc');
    });
  });
});
