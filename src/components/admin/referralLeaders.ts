// Кого показывать в списке лидеров на /admin?tab=referrals.
//
// Реферальная запись создаётся каждому пользователю — со своим slug'ом, даже
// если человек никогда никого не приводил. На проде из 49 лидеров пустыми были
// 39: список читался как свалка из телефонов и UUID, а десять работающих
// партнёров в нём приходилось искать глазами.

export interface LeaderLike {
  id: string;
  level: number;
  parent_leader_id: string | null;
  total_referees: number;
}

/** К лидеру привязан хотя бы один пользователь. */
export const hasAttachedUsers = (leader: LeaderLike): boolean => leader.total_referees > 0;

/**
 * Идентификаторы лидеров, которые остаются в списке.
 *
 * Родитель остаётся видимым, если пользователей привёл его суб-лидер: иначе
 * вместе с «пустым» лидером ур.1 из списка исчезло бы поддерево с живыми
 * рефералами и начислениями — то есть деньги, по которым и нужен этот экран.
 */
export function visibleLeaderIds(all: LeaderLike[]): Set<string> {
  const visible = new Set(all.filter(hasAttachedUsers).map(l => String(l.id)));
  for (const leader of all) {
    if (visible.has(String(leader.id)) && leader.parent_leader_id) {
      visible.add(String(leader.parent_leader_id));
    }
  }
  return visible;
}
