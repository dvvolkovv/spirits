/**
 * Логика бутстрапа main.tsx (Task 9), вынесенная из компонента ради тестов
 * без рендера React-дерева.
 *
 * decideBootState — чистая функция ветвления. Два разных отрицательных
 * исхода различаются намеренно (не сворачиваются в один 'outside'):
 *
 * - insideTelegram=false — человек открыл страницу НЕ из Telegram (initData
 *   пуст). Показывать нужно «откройте через Telegram» — другого выхода нет,
 *   ссылка на приложение верна.
 * - insideTelegram=true, но статус tmaLogin не 'authenticated'/'needsChoice'
 *   (сеть легла, 8-секундный таймаут на плохом соединении, бэкенд
 *   недоступен) — это 'retry': человек УЖЕ внутри Telegram, ему нужна
 *   кнопка «повторить», а не совет открыть приложение, в котором он и так
 *   сидит. Раньше оба случая схлопывались в 'outside' — это была ошибка
 *   дизайна: человек в метро с таймаутом получал бесполезный текст и мог
 *   только убить и переоткрыть приложение.
 *
 * runBoot — сама последовательность эффектов (тема, ready/expand,
 * reauthHandler, вход), с внедряемыми зависимостями по умолчанию на
 * реальные модули — тесты подменяют их моками.
 *
 * retryLogin — то же самое действие, что кнопка «Повторить»: только
 * повторный вход, без повторной установки темы/reauthHandler (они уже
 * установлены первым runBoot и переустановка идемпотентна, но не нужна).
 * Явно НЕ зациклено и не таймерное — по запросу это одиночный вызов на
 * нажатие кнопки, автоматических ретраев нет: ретрай-шторм по живому, но
 * недоступному бэкенду хуже, чем кнопка, которую человек нажимает сам.
 */
import { apiClient } from '../services/apiClient';
import { applyTelegramTheme, readyAndExpand, isInsideTelegram } from './telegram';
import { tmaLogin, TmaLoginResult } from './tmaAuth';

export type BootState = 'authenticated' | 'needsChoice' | 'outside' | 'retry';

export function decideBootState(insideTelegram: boolean, status: TmaLoginResult['status'] | undefined): BootState {
  if (!insideTelegram) return 'outside';
  if (status === 'authenticated') return 'authenticated';
  if (status === 'needsChoice') return 'needsChoice';
  // Внутри Telegram, но вход не удался (сеть/таймаут/5xx) — не 'outside'.
  return 'retry';
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

/**
 * Действие кнопки «Повторить» на экране retry. Вызывается только когда мы
 * УЖЕ знаем, что находимся внутри Telegram (иначе экран retry не показан),
 * поэтому здесь insideTelegram жёстко true — тот же провал сети даст снова
 * 'retry', а не молчаливый откат на 'outside'.
 */
export async function retryLogin(tmaLoginFn: typeof tmaLogin = tmaLogin): Promise<BootState> {
  const r = await tmaLoginFn();
  return decideBootState(true, r.status);
}
