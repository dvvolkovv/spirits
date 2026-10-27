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

  // Находка ревью (F1): StudioPage слушает этот колбэк, чтобы перечитать
  // список продуктов, когда карточка под ним решила ожидающее действие.
  describe('onResolved', () => {
    it('зовётся один раз, когда «Удалить» доходит до done', async () => {
      api.get.mockResolvedValue(view());
      api.submit.mockResolvedValue(view({ status: 'done', result: { restoreUntil: '2026-11-24T10:00:00.000Z' } }));
      const onResolved = vi.fn();
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" onResolved={onResolved} />);
      await flush();
      expect(onResolved).not.toHaveBeenCalled();
      await clickAsync(byButton(container, new RegExp(tRu('products.action.delete.confirm')))!);
      expect(onResolved).toHaveBeenCalledTimes(1);
      expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));
    });

    it('не зовётся на первой загрузке уже решённого действия', async () => {
      // Открыли ссылку на карточку, действие уже done — это не переход,
      // просто показ прежнего исхода: список продуктов его уже не пропустит.
      api.get.mockResolvedValue(view({ status: 'done', result: { restoreUntil: '2026-11-24T10:00:00.000Z' } }));
      const onResolved = vi.fn();
      mount(<ProductActionCard actionId="a1" via="chat" onResolved={onResolved} />);
      await flush();
      expect(onResolved).not.toHaveBeenCalled();
    });

    it('не зовётся, когда отправка вернула pending с поправимой ошибкой', async () => {
      api.get.mockResolvedValue(view({ kind: 'create_bot', productId: null, productName: 'Бот' }));
      api.submit.mockResolvedValue(view({ kind: 'create_bot', status: 'pending', productName: 'Бот', result: { error: 'Telegram не принял токен' } }));
      const onResolved = vi.fn();
      const { container } = mount(<ProductActionCard actionId="a1" via="chat" onResolved={onResolved} />);
      await flush();
      const token = container.querySelector('[data-testid="product-action-token"]') as HTMLInputElement;
      type(token, '123:abc');
      await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.submit')))!);
      expect(onResolved).not.toHaveBeenCalled();
    });

    it('зовётся один раз, когда опрос «в работе» дотягивает до исхода', async () => {
      vi.useFakeTimers();
      api.get
        .mockResolvedValueOnce(view({ status: 'working' }))
        .mockResolvedValue(view({ status: 'done', result: { restoreUntil: '2026-11-24T10:00:00.000Z' } }));
      const onResolved = vi.fn();
      mount(<ProductActionCard actionId="a1" via="chat" onResolved={onResolved} />);
      await flush();
      expect(onResolved).not.toHaveBeenCalled();
      await actAsync(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(onResolved).toHaveBeenCalledTimes(1);
      expect(onResolved).toHaveBeenCalledWith(expect.objectContaining({ status: 'done' }));

      // Следующий тик не нашёл бы новой причины звать колбэк снова — статус
      // уже не working, опрос эффекта больше не идёт.
      await actAsync(async () => {
        await vi.advanceTimersByTimeAsync(3000);
      });
      expect(onResolved).toHaveBeenCalledTimes(1);
    });
  });
});

describe('карточка ключей', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });
  const keysView = (over: Partial<ProductActionView> = {}) =>
    view({ kind: 'keys', productKind: 'site', productName: 'Сайт', keyNames: ['API_KEY', 'OLD_KEY'], ...over });
  const buttonsByText = (c: HTMLElement, text: string) => [...c.querySelectorAll('button')].filter((b) => b.textContent === text);
  const replaceInputs = (c: HTMLElement) => [...c.querySelectorAll('[data-testid="product-action-key-replace"]')] as HTMLInputElement[];
  const nameInputs = (c: HTMLElement) => [...c.querySelectorAll('input[placeholder="API_KEY"]')] as HTMLInputElement[];
  const valueInputs = (c: HTMLElement) => [...c.querySelectorAll('[data-testid="product-action-secret-value"]')] as HTMLInputElement[];

  it('имена ключей видны, значений нет; замена, удаление и новый ключ уходят в set и remove', async () => {
    api.get.mockResolvedValue(keysView());
    api.submit.mockResolvedValue(keysView({ status: 'working' }));
    const { container, unmount } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.keys.title', { name: 'Сайт' }));
    expect(visibleText(container)).toContain('API_KEY');
    const replaces = container.querySelectorAll('[data-testid="product-action-key-replace"]');
    expect(replaces).toHaveLength(2);
    expect((replaces[0] as HTMLInputElement).value).toBe('');
    type(replaces[0], 'новое-значение');
    click(buttonsByText(container, tRu('products.action.keys.remove'))[1]);
    expect(visibleText(container)).toContain(tRu('products.action.keys.willRemove'));
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
    type(container.querySelector('input[placeholder="API_KEY"]')!, 'NEW_KEY');
    type(container.querySelector('[data-testid="product-action-secret-value"]')!, 'n');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).toHaveBeenCalledWith('a1', { set: { API_KEY: 'новое-значение', NEW_KEY: 'n' }, remove: ['OLD_KEY'], via: 'chat' });
    // Ответ «в работе» завёл опрос на настоящих таймерах — снять карточку,
    // чтобы её тики не стучались в заглушку api следующих тестов.
    unmount();
  });

  it('ничего не изменено — отказ на месте, на сервер не уходит', async () => {
    api.get.mockResolvedValue(keysView());
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.action.keys.nothing'));
  });

  it('у бота токен убрать нельзя — кнопки «Убрать» у BOT_TOKEN нет', async () => {
    api.get.mockResolvedValue(keysView({ productKind: 'bot', keyNames: ['BOT_TOKEN', 'API_KEY'] }));
    const { container } = mount(<ProductActionCard actionId="a1" via="tma" />);
    await flush();
    expect(buttonsByText(container, tRu('products.action.keys.remove'))).toHaveLength(1);
  });

  it('новый ключ с именем существующего — ошибка строки, на сервер не уходит', async () => {
    api.get.mockResolvedValue(keysView());
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
    type(container.querySelector('input[placeholder="API_KEY"]')!, 'API_KEY');
    type(container.querySelector('[data-testid="product-action-secret-value"]')!, 'x');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.action.keys.duplicate'));
  });

  // У формы бота строка BOT_TOKEN — ошибка «впишите в поле токена выше». В
  // карточке ключей такого поля нет: у бота токен — в списке текущих (новая
  // строка с ним — повтор), у сайта BOT_TOKEN — обычный ключ (сервер так и
  // считает, product-keys.service).
  it('у бота BOT_TOKEN новой строкой — повтор: токен меняют в списке выше', async () => {
    api.get.mockResolvedValue(keysView({ productKind: 'bot', keyNames: ['BOT_TOKEN', 'API_KEY'] }));
    const { container } = mount(<ProductActionCard actionId="a1" via="tma" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
    type(nameInputs(container)[0], 'BOT_TOKEN');
    type(valueInputs(container)[0], '123456:TEST');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.action.keys.duplicate'));
    expect(visibleText(container)).not.toContain(tRu('products.new.errors.secretNameBotToken'));
  });

  it('у сайта BOT_TOKEN — обычный ключ: новой строкой уходит в set', async () => {
    api.get.mockResolvedValue(keysView());
    api.submit.mockResolvedValue(keysView({ status: 'working' }));
    const { container, unmount } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
    type(nameInputs(container)[0], 'BOT_TOKEN');
    type(valueInputs(container)[0], 't');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).toHaveBeenCalledWith('a1', { set: { BOT_TOKEN: 't' }, remove: [], via: 'chat' });
    unmount();
  });

  // Имена свойств Object.prototype — годные имена переменных, сервер их
  // принимает. Состояние замены не должно брать их унаследованными: в поле
  // было бы «function Object()…», а отправка падала бы на .trim.
  type KeysBody = { set: Record<string, string>; remove: string[]; via: string };
  it('ключи с именами свойств Object.prototype: поля пустые, уходит только введённое', async () => {
    api.get.mockResolvedValue(keysView({ keyNames: ['constructor', '__proto__', 'toString'] }));
    api.submit.mockResolvedValue(keysView({ status: 'done' }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(replaceInputs(container).map((i) => i.value)).toEqual(['', '', '']);
    type(replaceInputs(container)[0], 'v');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).toHaveBeenCalledTimes(1);
    const body = api.submit.mock.calls[0][1] as KeysBody;
    expect(Object.keys(body.set)).toEqual(['constructor']);
    expect(Object.getOwnPropertyDescriptor(body.set, 'constructor')?.value).toBe('v');
    expect(body.remove).toEqual([]);
  });

  it('значение ключа __proto__ уходит в set собственным ключом тела', async () => {
    api.get.mockResolvedValue(keysView({ keyNames: ['constructor', '__proto__'] }));
    api.submit.mockResolvedValue(keysView({ status: 'done' }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    type(replaceInputs(container)[1], 'p');
    expect(replaceInputs(container)[1].value).toBe('p');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).toHaveBeenCalledTimes(1);
    const body = api.submit.mock.calls[0][1] as KeysBody;
    expect(Object.keys(body.set)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(body.set, '__proto__')?.value).toBe('p');
  });

  it('ключ, помеченный «Убрать», не уходит в set, даже если значение уже вписали', async () => {
    api.get.mockResolvedValue(keysView());
    api.submit.mockResolvedValue(keysView({ status: 'done' }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    type(replaceInputs(container)[1], 'новое');
    click(buttonsByText(container, tRu('products.action.keys.remove'))[1]);
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).toHaveBeenCalledWith('a1', { set: {}, remove: ['OLD_KEY'], via: 'chat' });
  });

  it('новая отправка снимает прежнее «ничего не изменено» — рядом с ошибкой строки оно не висит', async () => {
    api.get.mockResolvedValue(keysView());
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(visibleText(container)).toContain(tRu('products.action.keys.nothing'));
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
    type(nameInputs(container)[0], 'API_KEY');
    type(valueInputs(container)[0], 'x');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.action.keys.duplicate'));
    expect(visibleText(container)).not.toContain(tRu('products.action.keys.nothing'));
  });

  it('новая отправка снимает прежний отказ сервера', async () => {
    api.get.mockResolvedValue(keysView({ result: { error: 'сырой', reason: 'bad_token', field: 'BOT_TOKEN' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.keys.errors.bad_token'));
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
    type(nameInputs(container)[0], 'API_KEY');
    type(valueInputs(container)[0], 'x');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).not.toHaveBeenCalled();
    expect(visibleText(container)).toContain(tRu('products.action.keys.duplicate'));
    expect(visibleText(container)).not.toContain(tRu('products.action.keys.errors.bad_token'));
  });

  // Потолок — 64 ключа на продукт (SECRET_COUNT_MAX), считается от того, что
  // останется: у формы бота — 63 строки рядом с BOT_TOKEN, тут — свой счёт.
  it('потолок новых строк — 64 минус ключи, которые остаются', async () => {
    api.get.mockResolvedValue(keysView({ keyNames: Array.from({ length: 62 }, (_, i) => `KEY_${i}`) }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    const add = () => byButton(container, new RegExp(tRu('products.action.createBot.addKey')));
    click(add()!);
    click(add()!);
    expect(add()).toBeNull();
    expect(valueInputs(container)).toHaveLength(2);
    // Убранный ключ освобождает место под новую строку.
    click(buttonsByText(container, tRu('products.action.keys.remove'))[0]);
    expect(add()).not.toBeNull();
    click(add()!);
    expect(add()).toBeNull();
    expect(valueInputs(container)).toHaveLength(3);
  });

  it('смена actionId сбрасывает замены и пометки «убрать» прежней карточки', async () => {
    api.get.mockResolvedValueOnce(keysView());
    const { container, rerender } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    type(replaceInputs(container)[0], 'v');
    click(buttonsByText(container, tRu('products.action.keys.remove'))[1]);
    expect(visibleText(container)).toContain(tRu('products.action.keys.willRemove'));

    api.get.mockResolvedValueOnce(keysView({ id: 'a2' }));
    rerender(<ProductActionCard actionId="a2" via="chat" />);
    await flush();
    expect(replaceInputs(container)).toHaveLength(2);
    expect(replaceInputs(container)[0].value).toBe('');
    expect(visibleText(container)).not.toContain(tRu('products.action.keys.willRemove'));
  });

  it('готово и «в работе» — свои тексты ключей', async () => {
    api.get.mockResolvedValueOnce(keysView({ status: 'done' }));
    const a = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(a.container)).toContain(tRu('products.action.keys.done', { name: 'Сайт' }));
    api.get.mockResolvedValueOnce(keysView({ status: 'working' }));
    const b = mount(<ProductActionCard actionId="a2" via="chat" />);
    await flush();
    expect(visibleText(b.container)).toContain(tRu('products.action.keys.working'));
    // Карточка «в работе» опрашивает на настоящих таймерах — снять, чтобы её
    // тики не стучались в заглушку api следующих тестов.
    b.unmount();
    a.unmount();
  });

  it('«в работе» у ключей опрашивается дольше минуты: пересоздание контейнера бывает небыстрым', async () => {
    vi.useFakeTimers();
    api.get.mockResolvedValue(keysView({ status: 'working' }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    await actAsync(async () => { await vi.advanceTimersByTimeAsync(3000 * 25); });
    expect(api.get.mock.calls.length).toBeGreaterThan(21);
    expect(byButton(container, new RegExp(tRu('products.action.checkAgain')))).toBeNull();
  });

  // Сервер кладёт в result причину (reason) любого исхода — по ней текст
  // показывается на языке человека; русский error — только запасной.
  it('поправимый отказ — текстом причины, а не русским error сервера', async () => {
    api.get.mockResolvedValue(keysView({ result: { error: 'Telegram не принял токен бота (сырой текст)', reason: 'bad_token', field: 'BOT_TOKEN' } as any }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.keys.errors.bad_token'));
    expect(visibleText(container)).not.toContain('(сырой текст)');
  });

  it('bad_input называет ключ', async () => {
    api.get.mockResolvedValue(keysView({ result: { error: 'имя секрета PORT занято платформой', reason: 'bad_input', field: 'PORT' } as any }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.keys.errors.bad_input', { field: 'PORT' }));
  });

  it('исход смены неизвестен — свой текст в failed', async () => {
    api.get.mockResolvedValue(keysView({ status: 'failed', result: { error: 'сырой', reason: 'rekey_unknown' } as any }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.failed', { reason: tRu('products.action.keys.errors.rekey_unknown') }));
  });

  it('причина без перевода — показывается error сервера как есть', async () => {
    api.get.mockResolvedValue(keysView({ result: { error: 'Особая причина сервера', reason: 'zzz_new' } as any }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain('Особая причина сервера');
  });

  // У причины failed свой текст в словаре (он же — нечитаемые ключи, где
  // повтор не поможет): общий failedGeneric — только запасной для причины,
  // которой в словаре нет.
  it('причина failed — свой текст словаря, а не общее «не получилось»', async () => {
    api.get.mockResolvedValue(keysView({ status: 'failed', result: { error: 'сырой', reason: 'failed' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.failed', { reason: tRu('products.action.keys.errors.failed') }));
    expect(visibleText(container)).not.toContain(tRu('products.action.failedGeneric'));
  });

  it('отправка вернула pending с причиной failed — текст словаря, введённое остаётся', async () => {
    api.get.mockResolvedValue(keysView());
    api.submit.mockResolvedValue(keysView({ result: { error: 'Не получилось — попробуйте ещё раз позже', reason: 'failed' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    type(replaceInputs(container)[0], 'v');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(visibleText(container)).toContain(tRu('products.action.keys.errors.failed'));
    expect(replaceInputs(container)[0].value).toBe('v');
  });

  it('причина без перевода и без текста сервера — общее «не получилось»', async () => {
    api.get.mockResolvedValue(keysView({ status: 'failed', result: { reason: 'zzz_new' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    expect(visibleText(container)).toContain(tRu('products.action.failedGeneric'));
  });

  // field сервера: годное имя (в том числе занятое) — целиком, и сравнение
  // точное; негодное — обрезком shownSecretName (первые 8 знаков и «…»), и
  // строка ищется по началу имени.
  it('отказ с field подсвечивает поле этого ключа — точным именем, а не по началу', async () => {
    api.get.mockResolvedValue(keysView({ keyNames: ['API_KEY', 'API_KEY_2'], result: { error: 'x', reason: 'bad_input', field: 'API_KEY' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    const replaces = replaceInputs(container);
    expect(replaces[0].getAttribute('aria-invalid')).toBe('true');
    expect(replaces[1].getAttribute('aria-invalid')).toBe('false');
  });

  it('обрезанный field («…») находит новую строку по началу имени', async () => {
    api.get.mockResolvedValue(keysView());
    api.submit.mockResolvedValue(keysView({ result: { error: 'имя секрета не переменная окружения', reason: 'bad_input', field: 'ABCDEFGH…' } }));
    const { container } = mount(<ProductActionCard actionId="a1" via="chat" />);
    await flush();
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
    await clickAsync(byButton(container, new RegExp(tRu('products.action.createBot.addKey')))!);
    type(nameInputs(container)[0], 'ABCDEFGHIJKL');
    type(valueInputs(container)[0], 'v');
    type(nameInputs(container)[1], 'ABCDEFGX');
    type(valueInputs(container)[1], 'w');
    await clickAsync(byButton(container, new RegExp(tRu('products.action.keys.submit')))!);
    expect(api.submit).toHaveBeenCalledTimes(1);
    expect(visibleText(container)).toContain(tRu('products.action.keys.errors.bad_input', { field: 'ABCDEFGH…' }));
    expect(nameInputs(container)[0].getAttribute('aria-invalid')).toBe('true');
    expect(nameInputs(container)[1].getAttribute('aria-invalid')).toBe('false');
    expect(replaceInputs(container).map((i) => i.getAttribute('aria-invalid'))).toEqual(['false', 'false']);
  });
});
