import type { TFunction } from 'i18next';

/** Те же пометки, что CallFlag в spirits_back/src/admin/callFlags.ts. */
export const KNOWN_FLAGS = ['interrupted', 'failed', 'live', 'silent', 'nearly_silent', 'short'] as const;
export type CallFlag = (typeof KNOWN_FLAGS)[number];

const LABELS: Record<CallFlag, [string, string]> = {
  interrupted: ['admin.calls.flag.interrupted', 'не состоялся'],
  failed: ['admin.calls.flag.failed', 'сбой'],
  live: ['admin.calls.flag.live', 'идёт сейчас'],
  silent: ['admin.calls.flag.silent', 'человек молчал'],
  nearly_silent: ['admin.calls.flag.nearlySilent', 'почти молчал'],
  short: ['admin.calls.flag.short', 'короткий'],
};

const TONES: Record<CallFlag, 'danger' | 'warn' | 'neutral'> = {
  interrupted: 'danger',
  failed: 'danger',
  live: 'neutral',
  silent: 'danger',
  nearly_silent: 'warn',
  short: 'warn',
};

/** Своё ли это поле таблицы, а не унаследованное от Object.prototype. */
const own = (table: object, key: string) => Object.prototype.hasOwnProperty.call(table, key);

/**
 * Незнакомую пометку показываем как есть, а не прячем: бэкенд может завести
 * новую раньше, чем обновится фронт, и молча потерянная пометка хуже, чем
 * непереведённая. Поиск — только по своим полям таблиц: иначе «constructor»
 * достал бы из прототипа функцию вместо подписи и тона.
 */
export function flagLabel(flag: string, t: TFunction): string {
  const pair = own(LABELS, flag) ? LABELS[flag as CallFlag] : undefined;
  return pair ? t(pair[0], pair[1]) : flag;
}

export function flagTone(flag: string): 'danger' | 'warn' | 'neutral' {
  return own(TONES, flag) ? TONES[flag as CallFlag] : 'neutral';
}
