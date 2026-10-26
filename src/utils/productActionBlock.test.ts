import { describe, it, expect } from 'vitest';
import { extractProductActions, stripProductActionBlocks } from './productActionBlock';
import { parseCustomMarkdown } from './customMarkdown';

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
const block = (id = ID) => '```product-action\n{"id":"' + id + '"}\n```';

describe('блок карточки продукта', () => {
  it('блок → маркер, id — в карту', () => {
    const r = extractProductActions(`Готово.\n\n${block()}`);
    expect(r.content).toBe('Готово.\n\n__PACTION_0__');
    expect(r.actions.get('0')).toBe(ID);
  });

  it('не uuid или мусор внутри — блок исчезает без карточки', () => {
    const r = extractProductActions('Текст\n\n```product-action\n{"id":"drop"}\n```');
    expect(r.content).toBe('Текст\n\n');
    expect(r.actions.size).toBe(0);
  });

  it('копирование — без блоков', () => {
    expect(stripProductActionBlocks(`А\n\n${block()}`)).toBe('А\n\n');
  });

  it('parseCustomMarkdown отдаёт карточки и не трогает блок вопросов', () => {
    const r = parseCustomMarkdown(`Ниже карточка.\n\n${block()}`);
    expect(r.content).toContain('__PACTION_0__');
    expect(r.productActions.get('0')).toBe(ID);
    expect(r.asks.size).toBe(0);
  });

  // Доп. защита сверх плана задачи: повтор одного и того же id в тексте
  // (сервер по ошибке/гонке дважды дописал блок) не должен давать две
  // отдельные карточки — только первое вхождение становится маркером, а
  // повторный блок с тем же id исчезает без следа (как мусор).
  it('повтор одного id — одна карточка, второй блок исчезает без маркера', () => {
    const id2 = 'bbbbbbbb-cccc-4ddd-9eee-ffffffffffff';
    const r = extractProductActions(`${block()}\n\n${block()}\n\n${block(id2)}`);
    expect(r.content).toBe('__PACTION_0__\n\n\n\n__PACTION_1__');
    expect(r.actions.size).toBe(2);
    expect(r.actions.get('0')).toBe(ID);
    expect(r.actions.get('1')).toBe(id2);
  });
});
