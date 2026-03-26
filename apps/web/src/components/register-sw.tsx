'use client';

import { useEffect } from 'react';

/**
 * Service Worker を登録するClient Component
 *
 * WHY: Next.jsのServer Componentからはnavigatorにアクセスできないため、
 * Client Componentで登録する。
 */
export function RegisterSW() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch((err) => {
        console.error('SW registration failed:', err);
      });
    }
  }, []);

  return null;
}
