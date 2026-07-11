'use client';

/**
 * ログイン／新規登録（設計 ChibaTech Portal Auth.dc.html）。
 *
 * WHY: signIn はクライアントで実行する必要があるため "use client"。設計の分割
 * レイアウト（左=ブランド訴求 / 右=フォーム）をそのまま実装しつつ、ログインは
 * 実際の next-auth（credentials: studentId+password）に、新規登録は /api/auth/register
 * に接続する。設計の flex-wrap により狭幅では自動で縦積みになる（スマホ対応）。
 */
import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { loginSchema } from '@chibatech/shared';
import { useTheme } from '@/components/theme-provider';

type Mode = 'login' | 'signup';

const inputStyle: React.CSSProperties = {
  height: 47,
  padding: '0 15px',
  borderRadius: 12,
  border: '1px solid var(--line-2)',
  background: 'var(--surface)',
  color: 'var(--ink)',
  fontFamily: 'var(--font-mono)',
  fontSize: 14,
  outline: 'none',
  width: '100%',
};

const labelStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' };
const primaryBtn: React.CSSProperties = { height: 48, borderRadius: 12, border: 'none', background: 'var(--ink)', color: 'var(--surface)', fontSize: 14.5, fontWeight: 700 };

export function LoginForm() {
  const { theme, toggleTheme } = useTheme();
  const dark = theme === 'dark';

  const [mode, setMode] = useState<Mode>('login');
  const [done, setDone] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // login fields
  const [studentId, setStudentId] = useState('');
  const [password, setPassword] = useState('');

  // signup fields
  const [suId, setSuId] = useState('');
  const [suName, setSuName] = useState('');
  const [suMail, setSuMail] = useState('');
  const [suPw, setSuPw] = useState('');
  const [suPw2, setSuPw2] = useState('');
  const [agree, setAgree] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const parsed = loginSchema.safeParse({ studentId, password });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message || '入力を確認してください');
      return;
    }
    setLoading(true);
    try {
      const result = await signIn('credentials', {
        studentId: parsed.data.studentId,
        password: parsed.data.password,
        redirect: false,
      });
      if (result?.error) {
        setError('MARINE User ID またはパスワードが正しくありません');
      } else {
        window.location.href = '/';
      }
    } catch {
      setError('ログインに失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (suPw !== suPw2) {
      setError('パスワードが一致しません');
      return;
    }
    if (!agree) {
      setError('利用規約への同意が必要です');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: suId.toUpperCase(), email: suMail, password: suPw }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data?.error || '登録に失敗しました。入力内容を確認してください。');
      }
    } catch {
      setError('登録に失敗しました。もう一度お試しください。');
    } finally {
      setLoading(false);
    }
  }

  const switchMode = (m: Mode) => {
    setMode(m);
    setDone(false);
    setShowPw(false);
    setError('');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexWrap: 'wrap', background: 'var(--bg)', color: 'var(--ink)' }}>
      {/* 左：ブランドパネル（≥800pxで左、狭幅では上に回り込み） */}
      <div style={{ flex: '1.05 1 400px', minWidth: 0, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 28, padding: '48px 52px', color: '#fff', background: 'linear-gradient(150deg,#23262B 0%, #15171A 55%, #0E0F11 100%)' }}>
        <div aria-hidden="true" style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.055) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.055) 1px,transparent 1px)', backgroundSize: '26px 26px', pointerEvents: 'none' }} />
        <div aria-hidden="true" style={{ position: 'absolute', top: -120, right: -80, width: 380, height: 380, borderRadius: 999, background: 'radial-gradient(circle, rgba(255,255,255,.13), transparent 68%)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true"><rect x="2.5" y="2.5" width="27" height="27" rx="8" fill="#FFFFFF" /><path d="M19.64 10.94A6.6 6.6 0 1 0 19.64 21.06" fill="none" stroke="#15171A" strokeWidth="3.4" strokeLinecap="round" /><rect x="20.7" y="14.3" width="3.4" height="3.4" rx="1.1" fill="#15171A" /></svg>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: '-.01em', lineHeight: 1.2 }}>ChibaTech Portal</div>
            <div style={{ fontSize: 11.5, color: 'rgba(255,255,255,.55)' }}>千葉工業大学 学生ポータル</div>
          </div>
        </div>

        <div style={{ position: 'relative', maxWidth: 440 }}>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.02em', lineHeight: 1.35, fontFamily: 'var(--font-jp)' }}>大学のすべてを、<br />ひとつの画面に。</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.65)', lineHeight: 1.8, marginTop: 14 }}>時間割・出席・課題・お知らせ・シラバスからスクールバスのダイヤまで。毎日つかう情報をまとめて届けます。</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 13, marginTop: 28 }}>
            {[
              { icon: (<><rect x="4" y="5" width="16" height="16" rx="2.4" /><path d="M4 9.5h16M9 3v3M15 3v3" /></>), text: '時間割と出席状況をリアルタイムに確認' },
              { icon: (<><path d="M9 11l3 3 8-8" /><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" /></>), text: '課題・提出物の締切をリマインド' },
              { icon: (<><rect x="4" y="4" width="16" height="12" rx="2" /><path d="M4 11h16M8 16v2.4M16 16v2.4" /></>), text: 'スクールバス・電車ダイヤもすぐに' },
            ].map((f, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, fontSize: 13, color: 'rgba(255,255,255,.85)' }}>
                <span style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">{f.icon}</svg>
                </span>
                {f.text}
              </div>
            ))}
          </div>
        </div>

        <div style={{ position: 'relative', fontSize: 11.5, color: 'rgba(255,255,255,.4)' }}>© 2026 ChibaTech Portal · プロトタイプ</div>
      </div>

      {/* 右：フォームパネル */}
      <div style={{ flex: '1 1 400px', minWidth: 0, display: 'flex', flexDirection: 'column', padding: '24px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button type="button" onClick={toggleTheme} aria-label={dark ? 'ライトモードに切り替え' : 'ダークモードに切り替え'} style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 999, padding: '7px 14px', color: 'var(--ink-2)', fontSize: 12, fontWeight: 600, boxShadow: 'var(--shadow-sm)' }}>{dark ? 'ライト' : 'ダーク'}</button>
        </div>

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 0' }}>
          <div style={{ width: 400, maxWidth: '100%' }}>
            {error && (
              <div style={{ marginBottom: 16, borderRadius: 12, background: 'var(--surface-2)', border: '1px solid var(--line-2)', padding: '11px 14px', fontSize: 13, color: 'var(--ink)' }}>{error}</div>
            )}

            {done ? (
              <div className="ctp-screen" style={{ textAlign: 'center', padding: '20px 0' }}>
                <div style={{ width: 64, height: 64, borderRadius: 999, background: 'var(--ink)', color: 'var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></div>
                <div style={{ fontSize: 22, fontWeight: 700, marginTop: 20, fontFamily: 'var(--font-jp)' }}>登録が完了しました</div>
                <div style={{ fontSize: 13.5, color: 'var(--ink-3)', lineHeight: 1.8, marginTop: 10 }}>MARINE User ID とパスワードでログインできます。</div>
                <button type="button" onClick={() => switchMode('login')} style={{ ...primaryBtn, width: '100%', marginTop: 26 }}>ログインに戻る</button>
              </div>
            ) : mode === 'login' ? (
              <div className="ctp-screen">
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', fontFamily: 'var(--font-jp)' }}>おかえりなさい</div>
                <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 7 }}>大学発行の MARINE アカウントでログインしてください。</div>
                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 28 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <label htmlFor="lg-id" style={labelStyle}>MARINE User ID</label>
                    <input id="lg-id" className="ctp-input" type="text" placeholder="M24G1140" autoComplete="username" value={studentId} onChange={(e) => setStudentId(e.target.value.toUpperCase())} maxLength={8} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <label htmlFor="lg-pw" style={labelStyle}>パスワード</label>
                      <button type="button" onClick={() => setShowPw((v) => !v)} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--ink-3)', background: 'none', border: 'none', padding: 0 }}>{showPw ? '隠す' : '表示'}</button>
                    </div>
                    <input id="lg-pw" className="ctp-input" type={showPw ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} maxLength={128} style={inputStyle} />
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '8px 12px', marginTop: 2 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--ink-2)', cursor: 'pointer', whiteSpace: 'nowrap' }}><input type="checkbox" style={{ width: 16, height: 16, accentColor: 'var(--ink)' }} />ログイン状態を保持</label>
                    <a href="#" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}>パスワードを忘れた場合</a>
                  </div>
                  <button type="submit" disabled={loading} style={{ ...primaryBtn, marginTop: 6, opacity: loading ? 0.7 : 1 }}>{loading ? 'ログイン中…' : 'ログイン'}</button>
                </form>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '22px 0' }}><span style={{ flex: 1, height: 1, background: 'var(--line)' }} /><span style={{ fontSize: 11.5, color: 'var(--ink-3)' }}>はじめての方</span><span style={{ flex: 1, height: 1, background: 'var(--line)' }} /></div>
                <button type="button" onClick={() => switchMode('signup')} style={{ width: '100%', height: 48, borderRadius: 12, border: '1px solid var(--line-2)', background: 'var(--surface)', color: 'var(--ink)', fontSize: 14, fontWeight: 700 }}>新規登録</button>
              </div>
            ) : (
              <div className="ctp-screen">
                <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', fontFamily: 'var(--font-jp)' }}>アカウントを作成</div>
                <div style={{ fontSize: 13.5, color: 'var(--ink-3)', marginTop: 7 }}>学籍番号と大学メールアドレスで登録できます。</div>
                <form onSubmit={handleSignup} style={{ display: 'flex', flexDirection: 'column', gap: 15, marginTop: 26 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label htmlFor="su-id" style={labelStyle}>学籍番号</label>
                      <input id="su-id" className="ctp-input" type="text" placeholder="M24G1140" value={suId} onChange={(e) => setSuId(e.target.value.toUpperCase())} maxLength={8} style={{ ...inputStyle, height: 46 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label htmlFor="su-name" style={labelStyle}>氏名</label>
                      <input id="su-name" className="ctp-input" type="text" placeholder="千葉 健太" autoComplete="name" value={suName} onChange={(e) => setSuName(e.target.value)} style={{ ...inputStyle, height: 46, fontFamily: 'var(--font-sans)' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <label htmlFor="su-mail" style={labelStyle}>大学メールアドレス</label>
                    <input id="su-mail" className="ctp-input" type="email" placeholder="s23t0042@s.chibatech.ac.jp" autoComplete="email" value={suMail} onChange={(e) => setSuMail(e.target.value)} style={{ ...inputStyle, height: 46, fontSize: 13.5 }} />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label htmlFor="su-pw" style={labelStyle}>パスワード</label>
                      <input id="su-pw" className="ctp-input" type={showPw ? 'text' : 'password'} placeholder="8文字以上" autoComplete="new-password" value={suPw} onChange={(e) => setSuPw(e.target.value)} style={{ ...inputStyle, height: 46 }} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                      <label htmlFor="su-pw2" style={labelStyle}>パスワード（確認）</label>
                      <input id="su-pw2" className="ctp-input" type={showPw ? 'text' : 'password'} placeholder="もう一度入力" autoComplete="new-password" value={suPw2} onChange={(e) => setSuPw2(e.target.value)} style={{ ...inputStyle, height: 46 }} />
                    </div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.6, cursor: 'pointer', marginTop: 2 }}>
                    <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--ink)', marginTop: 2, flex: 'none' }} />
                    <span><span style={{ color: 'var(--ink)', fontWeight: 600 }}>利用規約</span>と<span style={{ color: 'var(--ink)', fontWeight: 600 }}>プライバシーポリシー</span>に同意します</span>
                  </label>
                  <button type="submit" disabled={loading} style={{ ...primaryBtn, marginTop: 4, opacity: loading ? 0.7 : 1 }}>{loading ? '作成中…' : 'アカウントを作成'}</button>
                </form>
                <div style={{ textAlign: 'center', fontSize: 12.5, color: 'var(--ink-3)', marginTop: 20 }}>すでにアカウントをお持ちの方は <button type="button" onClick={() => switchMode('login')} style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', background: 'none', border: 'none', padding: 0, textDecoration: 'underline', textUnderlineOffset: 3 }}>ログイン</button></div>
              </div>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', fontSize: 11.5, color: 'var(--ink-3)' }}>ログインでお困りの場合は <span style={{ color: 'var(--ink-2)', fontWeight: 600 }}>サポート窓口</span> へ</div>
      </div>
    </div>
  );
}
