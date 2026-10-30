// @vitest-environment jsdom
import { act } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { actAsync, clickAsync, doubleClick, flush, mount, type, Mounted } from '../../test/dom';
import ShortsOrderForm from './ShortsOrderForm';

const agents = [{ id: 10, name: 'Алексей', displayName: 'Алексей — юрист' }];
let m: Mounted;
afterEach(() => m?.unmount());
const q = (id: string) => m.container.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const choose = (id: string, value: string) => {
  const el = q(id) as HTMLSelectElement;
  act(() => {
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

/** onOrder, который не отвечает, пока тест сам не разрешит промис — для сценариев с висящим запросом. */
const deferredOrder = () => {
  let resolve!: (v: boolean) => void;
  const onOrder = vi.fn(() => new Promise<boolean>((r) => { resolve = r; }));
  return { onOrder, resolve: (v: boolean) => resolve(v) };
};

describe('заказ ролика', () => {
  it('тема одной строкой; «Заказать» — от 10 знаков; после заказа поле пустеет', async () => {
    const onOrder = vi.fn(async () => true);
    m = mount(<ShortsOrderForm agents={agents} busy={false} onOrder={onOrder} onRefill={vi.fn()} />);
    const submit = q('shorts-order-submit') as HTMLButtonElement;
    type(q('shorts-order-topic')!, 'коротко');
    expect(submit.disabled).toBe(true);
    type(q('shorts-order-topic')!, 'Разнос плохого договора аренды');
    expect(submit.disabled).toBe(false);
    await clickAsync(submit);
    // Ответ onOrder и очистка поля — ещё пара оборотов микрозадач после клика.
    await flush();
    await flush();
    expect(onOrder).toHaveBeenCalledWith({ action: 'order', topic: 'Разнос плохого договора аренды', rubric: 'assistant' });
    expect((q('shorts-order-topic') as HTMLInputElement).value).toBe('');
  });

  it('подача и ассистент уходят, только если выбраны', async () => {
    const onOrder = vi.fn(async () => true);
    m = mount(<ShortsOrderForm agents={agents} busy={false} onOrder={onOrder} onRefill={vi.fn()} />);
    type(q('shorts-order-topic')!, 'Разнос плохого договора аренды');
    choose('shorts-order-angle', 'roast');
    choose('shorts-order-assistant', '10');
    await clickAsync(q('shorts-order-submit')!);
    expect(onOrder).toHaveBeenCalledWith({
      action: 'order', topic: 'Разнос плохого договора аренды', rubric: 'assistant', angle: 'roast', assistantId: 10,
    });
  });

  it('«Реальный кейс» — многострочная история со счётчиком; сверх 4000 знаков — не отправить', () => {
    m = mount(<ShortsOrderForm agents={[]} busy={false} onOrder={vi.fn(async () => true)} onRefill={vi.fn()} />);
    choose('shorts-order-rubric', 'case');
    expect(q('shorts-order-topic')).toBeNull();
    type(q('shorts-order-story')!, 'одна\nдве');
    expect(q('shorts-order-count')!.textContent).toBe('8 / 4000');
    type(q('shorts-order-story')!, 'я'.repeat(4001));
    expect((q('shorts-order-submit') as HTMLButtonElement).disabled).toBe(true);
  });

  it('«Пополнить темы недели» зовёт пополнение', async () => {
    const onRefill = vi.fn();
    m = mount(<ShortsOrderForm agents={[]} busy={false} onOrder={vi.fn(async () => true)} onRefill={onRefill} />);
    await clickAsync(q('shorts-refill')!);
    expect(onRefill).toHaveBeenCalledTimes(1);
  });

  it('текст, изменённый во время запроса, НЕ стирается после true', async () => {
    const { onOrder, resolve } = deferredOrder();
    m = mount(<ShortsOrderForm agents={agents} busy={false} onOrder={onOrder} onRefill={vi.fn()} />);
    type(q('shorts-order-topic')!, 'Разнос плохого договора аренды');
    await clickAsync(q('shorts-order-submit')!);
    // Пока запрос висит, в поле вписывают новый текст.
    type(q('shorts-order-topic')!, 'Другая тема поверх старой');
    await actAsync(() => resolve(true));
    expect((q('shorts-order-topic') as HTMLInputElement).value).toBe('Другая тема поверх старой');
  });

  it('false (отказ или дубль) — текст остаётся', async () => {
    const { onOrder, resolve } = deferredOrder();
    m = mount(<ShortsOrderForm agents={agents} busy={false} onOrder={onOrder} onRefill={vi.fn()} />);
    type(q('shorts-order-topic')!, 'Разнос плохого договора аренды');
    await clickAsync(q('shorts-order-submit')!);
    await actAsync(() => resolve(false));
    expect((q('shorts-order-topic') as HTMLInputElement).value).toBe('Разнос плохого договора аренды');
  });

  it('«Реальный кейс»: многострочная история уходит рубрикой case и чистится после true', async () => {
    const onOrder = vi.fn(async () => true);
    m = mount(<ShortsOrderForm agents={agents} busy={false} onOrder={onOrder} onRefill={vi.fn()} />);
    choose('shorts-order-rubric', 'case');
    type(q('shorts-order-story')!, 'одна строка\nдве строки');
    await clickAsync(q('shorts-order-submit')!);
    await flush();
    expect(onOrder).toHaveBeenCalledWith({ action: 'order', topic: 'одна строка\nдве строки', rubric: 'case' });
    expect((q('shorts-order-story') as HTMLTextAreaElement).value).toBe('');
  });

  it('busy — недоступны и «Заказать», и «Пополнить темы недели»', () => {
    m = mount(<ShortsOrderForm agents={agents} busy={true} onOrder={vi.fn(async () => true)} onRefill={vi.fn()} />);
    type(q('shorts-order-topic')!, 'Разнос плохого договора аренды');
    expect((q('shorts-order-submit') as HTMLButtonElement).disabled).toBe(true);
    expect((q('shorts-refill') as HTMLButtonElement).disabled).toBe(true);
  });

  it('ровно 4000 знаков — «Заказать» доступна', () => {
    m = mount(<ShortsOrderForm agents={agents} busy={false} onOrder={vi.fn(async () => true)} onRefill={vi.fn()} />);
    type(q('shorts-order-topic')!, 'я'.repeat(4000));
    expect((q('shorts-order-submit') as HTMLButtonElement).disabled).toBe(false);
  });

  it('двойной клик на «Заказать» во время висящего запроса — один вызов onOrder', async () => {
    const { onOrder, resolve } = deferredOrder();
    m = mount(<ShortsOrderForm agents={agents} busy={false} onOrder={onOrder} onRefill={vi.fn()} />);
    type(q('shorts-order-topic')!, 'Разнос плохого договора аренды');
    doubleClick(q('shorts-order-submit')!);
    expect(onOrder).toHaveBeenCalledTimes(1);
    await actAsync(() => resolve(true));
  });

  it('переключение на «Реальный кейс» переносит тему в историю; переключение назад — пустая тема', () => {
    m = mount(<ShortsOrderForm agents={agents} busy={false} onOrder={vi.fn(async () => true)} onRefill={vi.fn()} />);
    type(q('shorts-order-topic')!, 'Разнос плохого договора аренды');
    choose('shorts-order-rubric', 'case');
    expect((q('shorts-order-story') as HTMLTextAreaElement).value).toBe('Разнос плохого договора аренды');
    choose('shorts-order-rubric', 'assistant');
    expect((q('shorts-order-topic') as HTMLInputElement).value).toBe('');
  });

  it('подсказки: короткая история — «История — от 10 знаков.»; длинная тема — «Тема — не длиннее 4000 знаков.» с aria-invalid', () => {
    m = mount(<ShortsOrderForm agents={agents} busy={false} onOrder={vi.fn(async () => true)} onRefill={vi.fn()} />);
    choose('shorts-order-rubric', 'case');
    type(q('shorts-order-story')!, 'коротко');
    expect(m.container.textContent).toContain('История — от 10 знаков.');
    choose('shorts-order-rubric', 'assistant');
    type(q('shorts-order-topic')!, 'я'.repeat(4001));
    expect(m.container.textContent).toContain('Тема — не длиннее 4000 знаков.');
    expect(q('shorts-order-topic')!.getAttribute('aria-invalid')).toBe('true');
  });
});
