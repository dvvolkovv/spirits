/**
 * Логика бутстрапа main.tsx (Task 9), вынесенная из компонента ради тестов
 * без рендера React-дерева.
 *
 * decideBootState — чистая функция ветвления, ядро проверки: снаружи
 * Telegram всегда 'outside', вне зависимости от статуса tmaLogin (initData
 * там пуст и tmaLogin сам вернёт 'notInTelegram', но проверка снаружи —
 * страховка на случай будущего изменения этого контракта).
 *
 * runBoot — сама последовательность эффектов (тема, ready/expand,
 * reauthHandler, вход), с внедряемыми зависимостями по умолчанию на
 * реальные модули — тесты подменяют их моками.
 */
import { apiClient } from '../services/apiClient';
import { applyTelegramTheme, readyAndExpand, isInsideTelegram } from './telegram';
import { tmaLogin, TmaLoginResult } from './tmaAuth';

export type BootState = 'authenticated' | 'needsChoice' | 'outside';

export function decideBootState(insideTelegram: boolean, status: TmaLoginResult['status'] | undefined): BootState {
  if (!insideTelegram) return 'outside';
  if (status === 'authenticated') return 'authenticated';
  if (status === 'needsChoice') return 'needsChoice';
  return 'outside';
}

export interface BootDeps {
  applyTelegramTheme: () => void;
  readyAndExpand: () => void;
  isInsideTelegram: () => boolean;
  tmaLogin: typeof tmaLogin;
  setReauthHandler: (handler: (() => Promise<boolean>) | null) => void;
}

const defaultDeps: BootDeps = {
  applyTelegramTheme,
  readyAndExpand,
  isInsideTelegram,
  tmaLogin,
  setReauthHandler: (h) => apiClient.setReauthHandler(h),
};

export async function runBoot(deps: BootDeps = defaultDeps): Promise<BootState> {
  deps.applyTelegramTheme();
  deps.readyAndExpand();

  if (!deps.isInsideTelegram()) return 'outside';

  // Протухший refresh в Mini App лечится молча: initData доступен всегда,
  // поэтому экран входа после первого раза не показывается никогда.
  deps.setReauthHandler(async () => (await deps.tmaLogin()).status === 'authenticated');

  const r = await deps.tmaLogin();
  return decideBootState(true, r.status);
}
