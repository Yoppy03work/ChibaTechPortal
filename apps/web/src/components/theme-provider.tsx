'use client';

/**
 * テーマ（ライト/ダーク）と文字サイズのクライアント状態。
 *
 * WHY: 設計では設定画面と外側デモにテーマ切替がある。Next のルーティングでは
 * アプリ全体で1つの状態を共有したいので Context 化し、documentElement の
 * data-theme と --ctp-font-scale を更新 + localStorage に永続化する。
 * 初期適用は layout.tsx のブートスクリプト（nonce 付き）が担当し FOUC を防ぐ。
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

type ThemeCtx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  fontScale: number;
  setFontScale: (v: number) => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

const THEME_KEY = 'ctp-theme';
const FONT_KEY = 'ctp-font-scale';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('light');
  const [fontScale, setFontScaleState] = useState<number>(1);

  // マウント時に実DOM（ブートスクリプトが設定済み）から現状を読み取り同期
  useEffect(() => {
    const root = document.documentElement;
    const t = (root.getAttribute('data-theme') as Theme) || 'light';
    setThemeState(t === 'dark' ? 'dark' : 'light');
    const f = parseFloat(getComputedStyle(root).getPropertyValue('--ctp-font-scale'));
    if (!Number.isNaN(f) && f > 0) setFontScaleState(f);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    document.documentElement.setAttribute('data-theme', t);
    try {
      localStorage.setItem(THEME_KEY, t);
    } catch {
      /* localStorage 不可（プライベートモード等）は無視 */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  const setFontScale = useCallback((v: number) => {
    setFontScaleState(v);
    document.documentElement.style.setProperty('--ctp-font-scale', String(v));
    try {
      localStorage.setItem(FONT_KEY, String(v));
    } catch {
      /* 無視 */
    }
  }, []);

  return (
    <Ctx.Provider value={{ theme, setTheme, toggleTheme, fontScale, setFontScale }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
