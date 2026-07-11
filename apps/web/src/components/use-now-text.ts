'use client';

/**
 * 現在日時のライブ表示テキスト（年月日 (曜) HH:MM:SS、毎秒更新）。
 *
 * WHY: SSR とのハイドレーション不一致を避けるため、マウント後に初めて値を入れる
 * （それまでは '' を返し、呼び出し側は静的なフォールバック文字列を出す）。
 */
import { useEffect, useState } from 'react';

const WD = ['日', '月', '火', '水', '木', '金', '土'];

function format(d: Date): string {
  const two = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 (${WD[d.getDay()]}) ${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;
}

export function useNowText(): string {
  const [text, setText] = useState('');
  useEffect(() => {
    setText(format(new Date()));
    const id = setInterval(() => setText(format(new Date())), 1000);
    return () => clearInterval(id);
  }, []);
  return text;
}
