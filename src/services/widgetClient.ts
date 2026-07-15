import { apiClient } from './apiClient';
import { tokenManager } from '../utils/tokenManager';

const BACKEND = import.meta.env.VITE_BACKEND_URL || '';

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
      avatarUrl: d.avatarUrl || '',
      contextLine: d.contextLine || '',
      energyLine: d.energyLine || '',
      hasEnergy: !!d.hasEnergy,
      // Токены + бэкенд — чтобы фоновый WorkManager обновлял виджет при закрытом
      // приложении (сам рефрешит access по refresh при 401). Хранятся в app-private prefs.
      accessToken: tokenManager.getAccessToken() || '',
      refreshToken: tokenManager.getRefreshToken() || '',
      backendUrl: BACKEND,
    });

    // Динамические персональные ярлыки (долгий тап по иконке) [Натив 5]:
    // «Продолжить с <последним>», недавний ассистент, Картинка, Голос.
    if (bridge.setShortcuts) {
      const items: Array<{ id: string; shortLabel: string; longLabel: string; path: string }> = [];
      items.push({
        id: 'resume',
        shortLabel: 'Продолжить',
        longLabel: d.assistantName ? `Продолжить с ${d.assistantName}` : 'Продолжить',
        path: '/chat?resume=1&src=shortcut',
      });
      // Недавний ассистент, отличный от последнего (последний уже покрыт «Продолжить»).
      const recents = (d.recentAssistants || []).filter(
        (a: any) => String(a.id) !== String(d.assistantId),
      );
      if (recents[0]) {
        items.push({
          id: 'a' + recents[0].id,
          shortLabel: recents[0].name,
          longLabel: `Открыть: ${recents[0].name}`,
          path: `/chat?assistant=${encodeURIComponent(recents[0].id)}&src=shortcut`,
        });
      }
      items.push({ id: 'image', shortLabel: 'Картинка', longLabel: 'Создать картинку', path: '/image-gen?src=shortcut' });
      items.push({ id: 'voice', shortLabel: 'Голос', longLabel: 'Сказать голосом', path: '/chat?voice=1&resume=1&src=shortcut' });
      try {
        await bridge.setShortcuts({ items: items.slice(0, 4) });
      } catch { /* ignore */ }
    }
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

// Deep-link из лаунчера Линкеона [Фаза 1]: linkeon://chat?voice=1 / ?say=...
// Открывает приложение (отдельный APK io.linkeon.launcher шлёт этот intent) →
// Capacitor App-plugin отдаёт URL в appUrlOpen → навигируем роутером в /chat с query.
// На вебе window.Capacitor отсутствует → no-op.
export function initDeepLinks(onNavigate: (path: string) => void): void {
  const app = (window as any).Capacitor?.Plugins?.App;
  if (!app?.addListener) return;
  const handle = (url: string) => {
    if (!url || url.indexOf('linkeon://') !== 0) return;
    const m = url.match(/^linkeon:\/\/([^?]*)(\?.*)?$/i);
    if (!m) return;
    const path = '/' + (m[1] || 'chat').replace(/^\/+/, '');
    onNavigate(path + (m[2] || ''));
  };
  // cold start: приложение открыли по linkeon:// из закрытого состояния
  try { app.getLaunchUrl?.().then((r: any) => { if (r && r.url) handle(r.url); }).catch(() => {}); } catch {}
  // warm: пришёл новый intent
  app.addListener('appUrlOpen', (ev: any) => { if (ev && ev.url) handle(ev.url); });
}

// Подписка на возврат приложения на передний план (обновляем виджет свежими данными).
export function onAppResume(cb: () => void): void {
  const app = (window as any).Capacitor?.Plugins?.App;
  if (!app?.addListener) return;
  app.addListener('appStateChange', (state: any) => {
    if (state && state.isActive) cb();
  });
}
