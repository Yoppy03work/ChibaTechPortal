/**
 * Service Worker
 *
 * WHY: Push通知受信、App Shellキャッシュを担当。
 * セキュリティ上、認証済みAPIレスポンスやダッシュボードページはキャッシュしない。
 * キャッシュ対象は公開ページ（/login, /offline）と静的アセットのみ。
 */

const CACHE_NAME = 'ctp-v2';

/** キャッシュ対象の公開ページ（認証不要） */
const PRECACHE_URLS = [
  '/login',
  '/offline',
];

/**
 * キャッシュしてはいけないパスのプレフィックス
 * WHY: 個人データ（お知らせ、時間割、出席ログ等）がブラウザに残り、
 * ログアウト後や共有端末で再表示されるリスクを防止する
 */
const NO_CACHE_PREFIXES = [
  '/api/',       // 認証済みAPIレスポンス（個人データ）
  '/dashboard',  // ダッシュボードページ
];

/** キャッシュ対象外かどうか判定する */
function shouldNotCache(pathname) {
  return NO_CACHE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

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

// --- Fetch ---
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // WHY: APIリクエストと認証済みページはキャッシュしない（network-only）
  if (shouldNotCache(url.pathname)) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 静的アセット・公開ページ: キャッシュ優先 + バックグラウンド更新（SWR）
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((resp) => {
          // WHY: 成功レスポンスのみキャッシュ（エラーページをキャッシュしない）
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => {
          // オフライン時はキャッシュから返す。キャッシュもなければオフラインページ
          return cached || caches.match('/offline');
        });
      return cached || fetchPromise;
    })
  );
});

// --- メッセージ: ログアウト時のキャッシュクリア ---
// WHY: ログアウト時にクライアントからpostMessageでキャッシュ全削除を指示する。
// 共有端末で前ユーザーの個人データがキャッシュに残るのを防止する。
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() => {
        // 公開ページのみ再キャッシュ
        return caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS));
      })
    );
  }
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
      for (const client of clients) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
