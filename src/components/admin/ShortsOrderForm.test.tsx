// @vitest-environment jsdom
import { act } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { clickAsync, flush, mount, type, Mounted } from '../../test/dom';
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
});
