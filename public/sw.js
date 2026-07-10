/* Linkeon PWA service worker — Слой 1 (low-friction Android).
 *
 * НАМЕРЕННО минимальный: только push + открытие по тапу. Никакого precache/
 * fetch-перехвата — SPA раздаётся Nginx'ом с хешированными бандлами, а кэширующий
 * SW уже несколько раз ловил на других проектах «залипший старый фронт» после
 * деплоя. Установка на домашний экран и standalone обеспечиваются manifest'ом,
 * push — этим воркером. Обновление логики фронта идёт обычным путём (деплой).
 */

self.addEventListener('install', () => {
  // Активируемся сразу, не ждём закрытия старых вкладок.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Входящий web-push от бэкенда (PushService.sendPush). payload — JSON:
// { title, body?, url?, image?, tag? }
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'Linkeon', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'Linkeon';
  const options = {
    body: data.body || '',
    icon: '/android-chrome-192x192.png',
    badge: '/android-chrome-192x192.png',
    image: data.image || undefined,
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { url: data.url || '/chat' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// Тап по уведомлению: фокус на уже открытой вкладке или открытие нужного экрана.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/chat';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Уже открыт Linkeon — фокусируем и навигируем.
        if ('focus' in client) {
          client.focus();
          if ('navigate' in client && target) {
            client.navigate(target).catch(() => {});
          }
          return;
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    }),
  );
});
