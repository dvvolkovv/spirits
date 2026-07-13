import { apiClient } from './apiClient';

// Мост к нативному домашнему виджету [Натив 4]. Всё через глобальный
// Capacitor-мост — на вебе window.Capacitor отсутствует, все функции no-op.
function wb(): any {
  return (window as any).Capacitor?.Plugins?.WidgetBridge || null;
}

export function hasWidgetBridge(): boolean {
  return !!wb();
}

// Тянем контент виджета с бэка и кладём в нативное хранилище (SharedPreferences).
// Токен остаётся в приложении; виджет только рисует сохранённое.
export async function refreshWidget(): Promise<void> {
  const bridge = wb();
  if (!bridge) return;
  try {
    const r = await apiClient.get('/webhook/app-widget/content');
    if (!r.ok) return;
    const d = await r.json();
    await bridge.update({
      assistantName: d.assistantName || '',
      assistantId: d.assistantId || '',
      contextLine: d.contextLine || '',
      energyLine: d.energyLine || '',
      hasEnergy: !!d.hasEnergy,
    });
  } catch {
    /* сеть/мост недоступны — тихо игнорируем */
  }
}

// Навигация по deep-link из виджета: cold start (consumeLaunchTarget) + warm
// (событие widgetOpen). onNavigate вызывает роутер приложения.
export async function initWidgetNavigation(onNavigate: (path: string) => void): Promise<void> {
  const bridge = wb();
  if (!bridge) return;
  try {
    const res = await bridge.consumeLaunchTarget();
    if (res && res.path) onNavigate(res.path);
    bridge.addListener('widgetOpen', (ev: any) => {
      if (ev && ev.path) onNavigate(ev.path);
    });
  } catch {
    /* ignore */
  }
}

// Подписка на возврат приложения на передний план (обновляем виджет свежими данными).
export function onAppResume(cb: () => void): void {
  const app = (window as any).Capacitor?.Plugins?.App;
  if (!app?.addListener) return;
  app.addListener('appStateChange', (state: any) => {
    if (state && state.isActive) cb();
  });
}
