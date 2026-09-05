import { describe, it, expect } from 'vitest';
import {
  clampPosition,
  defaultPosition,
  isTap,
  loadPosition,
  savePosition,
  BUTTON_SIZE,
  EDGE_MARGIN,
} from './floatingCallPosition';

const экран = { width: 390, height: 844 };

describe('clampPosition', () => {
  it('не даёт уехать за правый и нижний край', () => {
    expect(clampPosition({ x: 10000, y: 10000 }, экран)).toEqual({
      x: 390 - BUTTON_SIZE - EDGE_MARGIN,
      y: 844 - BUTTON_SIZE - EDGE_MARGIN,
    });
  });

  it('не даёт уехать за левый и верхний край', () => {
    expect(clampPosition({ x: -50, y: -50 }, экран)).toEqual({ x: EDGE_MARGIN, y: EDGE_MARGIN });
  });

  it('позицию внутри экрана не трогает', () => {
    expect(clampPosition({ x: 100, y: 200 }, экран)).toEqual({ x: 100, y: 200 });
  });

  it('на экране уже кнопки не выдаёт отрицательных координат', () => {
    // Вырожденный случай, но он реален: узкое окно на десктопе.
    const p = clampPosition({ x: 999, y: 999 }, { width: 40, height: 40 });
    expect(p.x).toBeGreaterThanOrEqual(0);
    expect(p.y).toBeGreaterThanOrEqual(0);
  });
});

describe('isTap', () => {
  it('дрожь пальца — это нажатие, а не перетаскивание', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 103, y: 101 })).toBe(true);
  });

  it('заметный сдвиг — перетаскивание', () => {
    expect(isTap({ x: 100, y: 100 }, { x: 140, y: 100 })).toBe(false);
  });
});

describe('defaultPosition', () => {
  it('в чате стоит выше, чем на других экранах: там снизу поле ввода', () => {
    const вЧате = defaultPosition(экран, true);
    const вне = defaultPosition(экран, false);
    expect(вЧате.y).toBeLessThan(вне.y);
  });

  it('дефолт всегда внутри экрана, даже на низком окне', () => {
    const p = defaultPosition({ width: 320, height: 200 }, true);
    expect(p.y).toBeGreaterThanOrEqual(EDGE_MARGIN);
    expect(p.y + BUTTON_SIZE).toBeLessThanOrEqual(200);
  });
});

describe('сохранение позиции', () => {
  const хранилище = (значение: string | null) => ({
    getItem: () => значение,
    setItem: () => {},
  });

  it('читает сохранённое', () => {
    expect(loadPosition(хранилище('{"x":12,"y":34}'))).toEqual({ x: 12, y: 34 });
  });

  it('мусор в хранилище не роняет приложение', () => {
    expect(loadPosition(хранилище('не json'))).toBeNull();
    expect(loadPosition(хранилище('{"x":"право","y":5}'))).toBeNull();
    expect(loadPosition(хранилище('{"x":null}'))).toBeNull();
    expect(loadPosition(хранилище(null))).toBeNull();
  });

  it('NaN и Infinity отбрасываются: с ними кнопка исчезла бы с экрана', () => {
    expect(loadPosition(хранилище('{"x":null,"y":null}'))).toBeNull();
    expect(loadPosition(хранилище(`{"x":1e999,"y":0}`))).toBeNull();
  });

  it('переполненное хранилище не ломает перетаскивание', () => {
    const битое = { setItem: () => { throw new Error('QuotaExceeded'); } };
    expect(() => savePosition(битое, { x: 1, y: 2 })).not.toThrow();
  });
});
