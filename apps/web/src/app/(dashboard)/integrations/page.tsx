'use client';

/**
 * 外部連携 — 設計 isLink 画面（カレンダー同期・外部サービス）。
 *
 * WHY: カレンダー同期は未実装のため UI プレビュー（トグルはローカル状態のみ・保存されない）。
 * CIT Portal / manaba の認証情報は設定画面の「外部サービス認証」で実際に登録できる。
 */
import { useState } from 'react';
import Link from 'next/link';

export default function IntegrationsPage() {
  const [calSync, setCalSync] = useState(false);

  const card: React.CSSProperties = { overflow: 'hidden', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--shadow-card)' };

  return (
    <div className="ctp-screen" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720 }}>
      <Link href="/settings" style={{ alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)', textDecoration: 'none' }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>設定に戻る
      </Link>

      <div style={{ fontSize: 12, color: 'var(--ink-3)', padding: '0 2px' }}>プレビュー版：カレンダー同期は準備中です（設定は保存されません）。</div>

      <div style={{ ...card, padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
            <div style={{ width: 44, height: 40, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ink)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="16" rx="2.4" /><path d="M4 9.5h16M9 3v3M15 3v3" /><path d="M15.5 13.5l-3.5 3.5-2-2" /></svg>
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>外部カレンダー連携</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>授業と課題の締切を自動で同期します</div>
            </div>
          </div>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: 'var(--ink-2)', padding: '6px 11px', borderRadius: 999, border: '1px solid var(--line-2)', flex: 'none' }}>
            <span style={{ width: 7, height: 7, borderRadius: 999, background: calSync ? 'var(--ink)' : 'var(--line-2)' }} />
            {calSync ? '同期オン（プレビュー）' : '未連携'}
          </span>
        </div>

        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--ink)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, flex: 'none' }}>G</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600 }}>Google カレンダー</div>
              <div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>{calSync ? '同期オン（プレビュー・保存されません）' : '未連携'}</div>
            </div>
            <button type="button" role="switch" aria-checked={calSync} aria-label="Googleカレンダー同期" onClick={() => setCalSync((v) => !v)} style={{ position: 'relative', width: 44, height: 26, borderRadius: 999, border: 'none', background: calSync ? 'var(--ink)' : 'var(--line-2)', flex: 'none', transition: 'background .2s' }}>
              <span style={{ position: 'absolute', top: 3, left: calSync ? 21 : 3, width: 20, height: 20, borderRadius: 999, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.3)', transition: 'left .2s' }} />
            </button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="16" rx="2.4" /><path d="M4 9.5h16M9 3v3M15 3v3" /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>Apple カレンダー</div><div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>準備中</div></div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', border: '1px solid var(--line-2)', borderRadius: 999, padding: '3px 9px', flex: 'none' }}>準備中</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '13px 0', borderTop: '1px solid var(--line)' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><path d="M4 5h16v14H4z" /><path d="M4 8l8 5 8-5" /></svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13.5, fontWeight: 600 }}>購読用URL（.ics）</div><div style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>準備中</div></div>
            <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--ink-3)', border: '1px solid var(--line-2)', borderRadius: 999, padding: '3px 9px', flex: 'none' }}>準備中</span>
          </div>
        </div>
      </div>

      <div style={{ ...card, padding: '20px 22px' }}>
        <div style={{ fontSize: 15, fontWeight: 700 }}>学内システム連携</div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-3)', marginTop: 2 }}>CIT Portal / manaba の認証情報は設定画面から登録できます（お知らせ・課題・時間割の自動取得に使用）。</div>
        <Link href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, fontSize: 12.5, fontWeight: 700, padding: '9px 16px', borderRadius: 10, background: 'var(--ink)', color: 'var(--surface)', textDecoration: 'none' }}>
          設定で認証情報を登録
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </Link>
      </div>

      <div style={{ fontSize: 12, color: 'var(--ink-3)', lineHeight: 1.65, padding: '0 4px' }}>
        連携を有効にすると、時間割と課題の締切が外部カレンダーに自動で反映されます（実装後）。
      </div>
    </div>
  );
}
