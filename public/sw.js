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

// Web Share Target (Слой 4). Ловим ТОЛЬКО POST /share — остальные запросы не
// трогаем (без кэша, чтобы не залипал старый фронт). Шаренный текст/URL кладём в
// query и открываем чат с преднабором; шаренную картинку — в Cache Storage,
// откуда её подхватит ChatInterface (?shared_image=1).
const SHARE_CACHE = 'linkeon-share';
const SHARE_IMAGE_KEY = '/__shared_image';

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'POST') return; // GET-навигация и статика идут как обычно
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.pathname !== '/share') return;
  event.respondWith(handleShareTarget(req));
});

async function handleShareTarget(request) {
  try {
    const form = await request.formData();
    const title = (form.get('title') || '').toString();
    const text = (form.get('text') || '').toString();
    const link = (form.get('url') || '').toString();
    const files = form.getAll('files').filter((f) => f && typeof f !== 'string' && f.size > 0);

    // Картинка → в Cache, редирект в чат с флагом (ChatInterface подхватит файл).
    const image = files.find((f) => (f.type || '').startsWith('image/'));
    if (image) {
      const cache = await caches.open(SHARE_CACHE);
      const name = (image.name || 'shared-image').replace(/[^\w.\-]+/g, '_');
      await cache.put(
        SHARE_IMAGE_KEY,
        new Response(image, {
          headers: {
            'Content-Type': image.type || 'image/jpeg',
            'X-Share-Filename': encodeURIComponent(name),
          },
        }),
      );
      return Response.redirect('/chat?shared_image=1', 303);
    }

    // Текст/URL → преднабор в поле ввода чата.
    const combined = [title, text, link].map((s) => s.trim()).filter(Boolean).join('\n');
    const q = combined ? `?share_text=${encodeURIComponent(combined)}` : '';
    return Response.redirect(`/chat${q}`, 303);
  } catch (e) {
    return Response.redirect('/chat', 303);
  }
}

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
