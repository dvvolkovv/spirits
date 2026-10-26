import { describe, it, expect } from 'vitest';
import { actionFromHash, actionFromLocation } from './productAction';

const ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';

describe('карточка продукта из адреса мини-приложения', () => {
  it('строка запроса (?pa=) — основной источник', () => {
    expect(actionFromLocation(`?pa=${ID}`, '')).toBe(ID);
  });

  it('фрагмент (#pa=) — запасной путь, когда строки запроса нет', () => {
    expect(actionFromLocation('', `#pa=${ID}`)).toBe(ID);
  });

  it('Telegram дописывает в фрагмент свои параметры запуска — свой находится среди них', () => {
    expect(actionFromLocation('', `#tgWebAppData=x&pa=${ID}`)).toBe(ID);
  });

  it('строка запроса без валидного id — null, фрагмент не подмешивается', () => {
    expect(actionFromLocation('?pa=bad', '')).toBeNull();
  });

  it('и то, и то пустые — null', () => {
    expect(actionFromLocation('', '')).toBeNull();
  });

  it('заданы оба — приоритет у строки запроса', () => {
    const other = 'bbbbbbbb-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    expect(actionFromLocation(`?pa=${ID}`, `#pa=${other}`)).toBe(ID);
  });

  it('actionFromHash — тонкая обёртка над тем же разбором', () => {
    expect(actionFromHash(`#pa=${ID}`)).toBe(ID);
    expect(actionFromHash('#pa=nope')).toBeNull();
    expect(actionFromHash('')).toBeNull();
  });
});
