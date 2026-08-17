import { describe, it, expect } from 'vitest';
import { hasAttachedUsers, visibleLeaderIds } from './referralLeaders';

const leader = (id: string, total_referees: number, extra: Partial<{ level: number; parent_leader_id: string | null }> = {}) => ({
  id,
  total_referees,
  level: extra.level ?? 1,
  parent_leader_id: extra.parent_leader_id ?? null,
});

describe('hasAttachedUsers', () => {
  it('привёл людей — показываем', () => {
    expect(hasAttachedUsers(leader('a', 3))).toBe(true);
  });

  it('ни одного пользователя — в списке не нужен', () => {
    expect(hasAttachedUsers(leader('a', 0))).toBe(false);
  });
});

describe('visibleLeaderIds', () => {
  it('оставляет только тех, к кому привязаны пользователи', () => {
    const all = [leader('a', 4), leader('b', 0), leader('c', 1)];
    expect(visibleLeaderIds(all)).toEqual(new Set(['a', 'c']));
  });

  it('пустой родитель остаётся, если людей привёл его суб-лидер', () => {
    // Иначе вместе с «пустым» лидером ур.1 из списка исчезло бы поддерево
    // с живыми рефералами и начислениями — деньги пропали бы из вида.
    const all = [leader('parent', 0), leader('kid', 2, { level: 2, parent_leader_id: 'parent' })];
    expect(visibleLeaderIds(all)).toEqual(new Set(['parent', 'kid']));
  });

  it('пустой родитель с пустым суб-лидером скрывается целиком', () => {
    const all = [leader('parent', 0), leader('kid', 0, { level: 2, parent_leader_id: 'parent' })];
    expect(visibleLeaderIds(all)).toEqual(new Set());
  });

  it('id сравниваются как строки — number из API не ломает связь с родителем', () => {
    const all = [
      { id: 7 as unknown as string, total_referees: 0, level: 1, parent_leader_id: null },
      { id: 8 as unknown as string, total_referees: 5, level: 2, parent_leader_id: 7 as unknown as string },
    ];
    expect(visibleLeaderIds(all)).toEqual(new Set(['7', '8']));
  });

  it('пустой список — пустой результат, без падений', () => {
    expect(visibleLeaderIds([])).toEqual(new Set());
  });
});
