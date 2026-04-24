/**
 * Service Worker
 *
 * WHY: Push通知受信、App Shellキャッシュを担当。
 * セキュリティ原則:
 *  - キャッシュは **allowlist** のみ（blocklist は把握漏れで個人データが残りやすい）
 *  - GET かつ same-origin かつ allowlist 合致のレスポンスだけ cache.put
 *  - 通知クリックで開く URL は same-origin + 許可パスに限定（Push payload 汚染対策）
 */

const CACHE_NAME = 'ctp-v3';

/** プリキャッシュする公開ページ（認証不要） */
const PRECACHE_URLS = ['/login', '/offline'];

/**
 * キャッシュ対象の allowlist。
 * WHY: sw.js 自身はキャッシュしない（SW 更新の混乱を避けるため network-only）。
 */
const CACHEABLE_PREFIXES = [
  '/_next/static/',
  '/icons/',
];

const CACHEABLE_EXACT = new Set([
  '/login',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
  '/robots.txt',
]);

/** 通知クリックで開いてよい pathname の allowlist（prefix） */
const ALLOWED_NOTIFICATION_PATHS = [
  '/',
  '/notifications',
  '/attendance',
  '/timetable',
];

/**
 * WHY: GET + same-origin + allowlist をすべて満たす request のみキャッシュ対象。
 */
function isCacheableRequest(request) {
  if (request.method !== 'GET') return false;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;

  if (CACHEABLE_EXACT.has(url.pathname)) return true;
  return CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

/**
 * 通知 data.url を同一 origin + 許可パスに制限して解決する。
 * Push payload が汚染されても外部フィッシング URL に飛ばないようにする。
 */
function resolveNotificationUrl(rawUrl) {
  const fallback = new URL('/', self.location.origin);

  let parsed;
  try {
    parsed = new URL(rawUrl ?? '/', self.location.origin);
  } catch {
    return fallback;
  }

  if (parsed.origin !== self.location.origin) return fallback;

  const ok = ALLOWED_NOTIFICATION_PATHS.some(
    (prefix) =>
      parsed.pathname === prefix ||
      (prefix !== '/' && parsed.pathname.startsWith(prefix + '/'))
  );
  return ok ? parsed : fallback;
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
  // WHY: allowlist を満たさないリクエストは完全に network-only。
  // 個人データ・認証済みページ・SW 自身・クロスオリジンを一切キャッシュしない。
  if (!isCacheableRequest(event.request)) {
    return; // pass through: デフォルトのネットワークフェッチに委ねる
  }

  // allowlist: キャッシュ優先 + バックグラウンド更新（SWR）
  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request)
        .then((resp) => {
          if (resp.ok) {
            const clone = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return resp;
        })
        .catch(() => cached || caches.match('/offline'));
      return cached || fetchPromise;
    })
  );
});

// --- メッセージ: ログアウト時のキャッシュクリア ---
// WHY: ログアウト時にクライアントから postMessage でキャッシュ全削除を指示する。
self.addEventListener('message', (event) => {
  if (event.data?.type === 'CLEAR_CACHE') {
    event.waitUntil(
      caches.delete(CACHE_NAME).then(() =>
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
      )
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
    vibrate: [200, 100, 200],
    tag: data.data?.source || 'general',
    renotify: true,
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'ChibaTechPortal', options)
  );
});

// --- 通知クリック時: 該当ページを開く ---
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const target = resolveNotificationUrl(event.notification.data?.url);

  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      for (const client of clients) {
        let clientUrl;
        try {
          clientUrl = new URL(client.url);
        } catch {
          continue;
        }
        if (
          clientUrl.origin === target.origin &&
          clientUrl.pathname === target.pathname &&
          'focus' in client
        ) {
          return client.focus();
        }
      }
      return self.clients.openWindow(target.toString());
    })
  );
});
