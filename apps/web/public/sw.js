/**
 * Service Worker
 *
 * WHY: Push通知受信、App Shellキャッシュ、Runtime Caching（SWR戦略）を担当。
 * Serwistの代わりに手書きSWで必要最小限を実装。
 */

const CACHE_NAME = 'ctp-v1';
const PRECACHE_URLS = [
  '/',
  '/login',
  '/offline',
];

// --- Install: App Shell をキャッシュ ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// --- Activate: 古いキャッシュを削除 ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// --- Fetch: Stale-While-Revalidate 戦略 ---
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // API リクエストはネットワーク優先
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(event.request)
        .then((resp) => {
          // 成功したらキャッシュを更新
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return resp;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // ページ・アセットはキャッシュ優先 + バックグラウンド更新
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((resp) => {
        const clone = resp.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return resp;
      });
      return cached || fetchPromise;
    })
  );
});

// --- Push通知受信 ---
self.addEventListener('push', (event) => {
  if (!event.data) return;

  const data = event.data.json();
  const options = {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: {
      url: data.data?.url || '/',
    },
    // WHY: vibrate で物理的に気づきやすくする（モバイル向け）
    vibrate: [200, 100, 200],
    tag: data.data?.source || 'general',
    // WHY: renotify で同じtagでも再通知する
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ChibaTechPortal', options)
  );
});

// --- 通知クリック時: 該当ページを開く ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const url = event.notification.data?.url || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // 既に開いているタブがあればフォーカス
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      // なければ新しいタブで開く
      return self.clients.openWindow(url);
    })
  );
});
