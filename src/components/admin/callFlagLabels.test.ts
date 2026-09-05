import { describe, it, expect } from 'vitest';
import { flagLabel, flagTone, KNOWN_FLAGS } from './callFlagLabels';

describe('подписи пометок', () => {
  const t = ((key: string, def?: string) => def ?? key) as any;

  it('у каждой известной пометки есть подпись и тон', () => {
    for (const f of KNOWN_FLAGS) {
      expect(flagLabel(f, t)).toBeTruthy();
      expect(['danger', 'warn', 'neutral']).toContain(flagTone(f));
    }
  });

  it('незнакомая пометка с бэкенда не роняет строку', () => {
    // Бэкенд может завести новую пометку раньше, чем обновится фронт.
    expect(flagLabel('что-то новое', t)).toBe('что-то новое');
    expect(flagTone('что-то новое')).toBe('neutral');
  });
});
