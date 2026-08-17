// Мост к нативному экрану первичной настройки «локального разума» [A3b/A6].
// Всё через глобальный Capacitor-мост; на вебе window.Capacitor отсутствует → no-op.
function sb(): any {
  return (window as any).Capacitor?.Plugins?.SetupBridge || null;
}

// Доступно только в нативном приложении (там есть on-device модель/захват уведомлений).
export function hasSetupBridge(): boolean {
  return !!sb();
}

// Открыть нативный экран настройки (уведомления → модель → бэкап).
export async function openSetup(): Promise<void> {
  const bridge = sb();
  if (!bridge) return;
  try {
    await bridge.open();
  } catch {
    /* нет моста / не нативное приложение — тихо игнорируем */
  }
}
