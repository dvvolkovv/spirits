import { describe, it, expect } from 'vitest';
import { fmtSince, parseProvider } from './globalLlm';

describe('fmtSince', () => {
  it('дд.мм чч:мм в местном времени — детерминированно независимо от часового пояса машины', () => {
    // new Date(y,m,d,h,mi) и .toISOString() используют один и тот же часовой
    // пояс процесса — круговой проход local → UTC → local даёт тот же самый
    // результат независимо от TZ среды, где запущен тест (мак, нода, CI).
    expect(fmtSince(new Date(2026, 0, 5, 7, 3).toISOString())).toBe('05.01 07:03');
  });

  it('дополняет нулями однозначные число, месяц, час и минуту', () => {
    expect(fmtSince(new Date(2026, 8, 1, 0, 0).toISOString())).toBe('01.09 00:00');
  });
});

describe('parseProvider', () => {
  it('известные модели проходят как есть', () => {
    expect(parseProvider('qwen')).toBe('qwen');
    expect(parseProvider('kimi')).toBe('kimi');
    expect(parseProvider('claude')).toBe('claude');
  });

  it('мусор, undefined и null — Claude (как рубильник без строки в БД)', () => {
    expect(parseProvider('garbage')).toBe('claude');
    expect(parseProvider(undefined)).toBe('claude');
    expect(parseProvider(null)).toBe('claude');
  });
});
