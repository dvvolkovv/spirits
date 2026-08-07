import { describe, it, expect } from 'vitest';
import { buttonClasses, fieldClasses, CONTROL_HEIGHT, CONTROL_RADIUS } from './controlStyles';

describe('buttonClasses', () => {
  it('все варианты одного роста и радиуса', () => {
    for (const v of ['primary', 'secondary', 'ghost'] as const) {
      expect(buttonClasses(v)).toContain(CONTROL_HEIGHT);
      expect(buttonClasses(v)).toContain(CONTROL_RADIUS);
    }
  });

  it('РЕГРЕССИЯ: ни у одного варианта нет собственной тени', () => {
    // Раньше тень висела ровно на одной кнопке из трёх — на отправке кода.
    for (const v of ['primary', 'secondary', 'ghost'] as const) {
      expect(buttonClasses(v)).not.toMatch(/\bshadow-(sm|md|lg|xl)\b/);
    }
  });

  it('варианты различимы по заливке', () => {
    expect(buttonClasses('primary')).toContain('bg-forest-800');
    expect(buttonClasses('secondary')).toContain('bg-white');
    expect(buttonClasses('ghost')).toContain('text-forest-800');
  });

  it('дополнительные классы приклеиваются в конец', () => {
    expect(buttonClasses('primary', 'mt-4')).toMatch(/mt-4$/);
  });
});

describe('fieldClasses', () => {
  it('совпадает с кнопкой по росту и радиусу', () => {
    expect(fieldClasses(false)).toContain(CONTROL_HEIGHT);
    expect(fieldClasses(false)).toContain(CONTROL_RADIUS);
  });

  it('ошибка меняет только цвет рамки', () => {
    expect(fieldClasses(true)).toContain('border-red-400');
    expect(fieldClasses(false)).toContain('border-gray-200');
  });
});
