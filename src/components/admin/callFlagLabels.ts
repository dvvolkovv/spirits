import type { TFunction } from 'i18next';

export const KNOWN_FLAGS = ['interrupted', 'silent', 'nearly_silent', 'short'] as const;
export type CallFlag = (typeof KNOWN_FLAGS)[number];

const LABELS: Record<CallFlag, [string, string]> = {
  interrupted: ['admin.calls.flag.interrupted', 'не состоялся'],
  silent: ['admin.calls.flag.silent', 'человек молчал'],
  nearly_silent: ['admin.calls.flag.nearlySilent', 'почти молчал'],
  short: ['admin.calls.flag.short', 'короткий'],
};

const TONES: Record<CallFlag, 'danger' | 'warn' | 'neutral'> = {
  interrupted: 'danger',
  silent: 'danger',
  nearly_silent: 'warn',
  short: 'warn',
};

/**
 * Незнакомую пометку показываем как есть, а не прячем: бэкенд может завести
 * новую раньше, чем обновится фронт, и молча потерянная пометка хуже, чем
 * непереведённая.
 */
export function flagLabel(flag: string, t: TFunction): string {
  const pair = LABELS[flag as CallFlag];
  return pair ? t(pair[0], pair[1]) : flag;
}

export function flagTone(flag: string): 'danger' | 'warn' | 'neutral' {
  return TONES[flag as CallFlag] ?? 'neutral';
}
