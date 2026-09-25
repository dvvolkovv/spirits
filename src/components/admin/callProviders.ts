import type { TFunction } from 'i18next';

/**
 * Площадки из voice_calls.provider. Звонок из приложения — тоже площадка: на
 * вкладке «Все» он стоит в ленте рядом со встречами, и без подписи строки не
 * различить.
 */
export const KNOWN_PROVIDERS = ['linkeon', 'linkeon_room', 'talerid', 'meet', 'zoom', 'teams', 'telemost'] as const;
export type CallProvider = (typeof KNOWN_PROVIDERS)[number];

const LABELS: Record<CallProvider, [string, string]> = {
  linkeon: ['admin.calls.provider.linkeon', 'Звонок'],
  linkeon_room: ['admin.calls.provider.linkeon_room', 'Комната Linkeon'],
  talerid: ['admin.calls.provider.talerid', 'Taler ID'],
  meet: ['admin.calls.provider.meet', 'Google Meet'],
  zoom: ['admin.calls.provider.zoom', 'Zoom'],
  teams: ['admin.calls.provider.teams', 'Microsoft Teams'],
  telemost: ['admin.calls.provider.telemost', 'Яндекс Телемост'],
};

/**
 * Незнакомую площадку показываем её техническим именем, а не прячем: бэкенд
 * заводит площадку раньше, чем фронт узнаёт её подпись, и спрятанная сессия
 * хуже неподписанной. hasOwnProperty — чтобы «constructor» из базы не достал
 * функцию из прототипа вместо подписи.
 */
export function providerLabel(provider: string, t: TFunction): string {
  const pair = Object.prototype.hasOwnProperty.call(LABELS, provider)
    ? LABELS[provider as CallProvider]
    : undefined;
  return pair ? t(pair[0], pair[1]) : provider;
}
