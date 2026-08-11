import { describe, it, expect } from 'vitest';
import { platformLabel, osLabel, sharePct, MOBILE_PLATFORMS } from './deviceLabels';

describe('подписи платформ', () => {
  it('переводит идентификаторы в человеческие названия', () => {
    expect(platformLabel('desktop')).toBe('Веб, десктоп');
    expect(platformLabel('mobile')).toBe('Веб, телефон');
    expect(platformLabel('tablet')).toBe('Веб, планшет');
    expect(platformLabel('app_flutter')).toBe('Мобильное приложение');
    expect(platformLabel('app_webview')).toBe('Мобильное приложение (обёртка)');
  });

  /**
   * «Не удалось определить» — это про сломанный разбор, и подпись обязана
   * звучать тревожно: рост этой доли означает, что остальным процентам
   * верить нельзя.
   */
  it('неузнанную платформу называет прямо, без эвфемизма «прочие»', () => {
    expect(platformLabel('unknown')).toBe('Не удалось определить');
  });

  it('незнакомый идентификатор отдаёт как есть, а не прячет', () => {
    expect(platformLabel('app_watch')).toBe('app_watch');
  });
});

describe('подписи операционных систем', () => {
  /**
   * Тот же ключ `unknown`, но смысл другой: у мобильного приложения на
   * Flutter платформа известна, а операционной системы в его строке нет.
   * Назвать это «не удалось определить» — значит выдать норму за поломку.
   */
  it('пустую ОС называет иначе, чем неузнанную платформу', () => {
    expect(osLabel('unknown')).toBe('Не сообщается');
    expect(osLabel('unknown')).not.toBe(platformLabel('unknown'));
  });

  it('известные системы отдаёт как есть', () => {
    expect(osLabel('Windows')).toBe('Windows');
    expect(osLabel('iOS')).toBe('iOS');
  });
});

describe('доля в процентах', () => {
  it('считает от числа активных, а не от суммы корзин', () => {
    expect(sharePct(41, 64)).toBe(64);
    expect(sharePct(18, 64)).toBe(28);
  });

  // Сумма долей заведомо больше 100: человек с двумя устройствами в двух
  // корзинах. Функция не должна пытаться это «исправить».
  it('не нормирует доли к сотне', () => {
    const total = 10;
    const sum = sharePct(8, total) + sharePct(7, total);
    expect(sum).toBeGreaterThan(100);
  });

  it('на пустой выборке отдаёт ноль, а не деление на ноль', () => {
    expect(sharePct(0, 0)).toBe(0);
    expect(Number.isFinite(sharePct(5, 0))).toBe(true);
  });
});

describe('какие платформы считаются мобильными', () => {
  // От этого списка зависят числа «трогали мобилку» и «только мобилка»,
  // которые бэкенд считает по такому же перечню. Разъедутся — цифры
  // в интерфейсе перестанут сходиться с подписью под ними.
  it('совпадает с перечнем бэкенда', () => {
    expect([...MOBILE_PLATFORMS].sort()).toEqual(['app_flutter', 'app_webview', 'mobile']);
  });
});
