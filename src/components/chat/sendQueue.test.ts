import { describe, it, expect } from 'vitest';
import { addToQueue, removeFromQueue, joinQueue, type QueuedMessage } from './sendQueue';

const q = (id: string, text: string): QueuedMessage => ({ id, text });

describe('addToQueue', () => {
  it('дописывает в конец, сохраняя порядок', () => {
    const before = [q('a', 'первое')];
    expect(addToQueue(before, 'второе', 'b')).toEqual([q('a', 'первое'), q('b', 'второе')]);
  });

  it('не мутирует исходный массив — React сравнивает по ссылке', () => {
    const before = [q('a', 'первое')];
    addToQueue(before, 'второе', 'b');
    expect(before).toEqual([q('a', 'первое')]);
  });
});

describe('removeFromQueue', () => {
  it('убирает нужный элемент, не задевая соседей', () => {
    const before = [q('a', 'раз'), q('b', 'два'), q('c', 'три')];
    expect(removeFromQueue(before, 'b')).toEqual([q('a', 'раз'), q('c', 'три')]);
  });

  it('на неизвестный id возвращает то же содержимое', () => {
    const before = [q('a', 'раз')];
    expect(removeFromQueue(before, 'нет-такого')).toEqual([q('a', 'раз')]);
  });
});

describe('joinQueue', () => {
  it('склеивает через пустую строку между репликами', () => {
    expect(joinQueue([q('a', 'первое'), q('b', 'второе')])).toBe('первое\n\nвторое');
  });

  it('триммит края каждой реплики: перевод строки из textarea не должен ехать в промпт', () => {
    expect(joinQueue([q('a', '  первое \n'), q('b', '\nвторое  ')])).toBe('первое\n\nвторое');
  });

  it('выбрасывает пустые реплики, а не оставляет дыру из переводов строк', () => {
    expect(joinQueue([q('a', 'первое'), q('b', '   '), q('c', 'третье')])).toBe('первое\n\nтретье');
  });

  it('на пустой очереди даёт пустую строку — по ней вызывающий понимает, что слать нечего', () => {
    expect(joinQueue([])).toBe('');
  });

  it('очередь из одних пробелов тоже даёт пустую строку', () => {
    expect(joinQueue([q('a', '  '), q('b', '\n')])).toBe('');
  });
});
