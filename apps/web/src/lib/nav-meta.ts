/**
 * ルート → 画面タイトル/サブタイトルの対応。
 * モバイルヘッダー(app-header)とデスクトップ上部バー(desktop-topbar)で共用する。
 */
export type Meta = { title: string; subtitle: string };

const WD = ['日', '月', '火', '水', '木', '金', '土'];

export function todayGreeting(): string {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 (${WD[d.getDay()]}) · こんにちは`;
}

export function metaFor(pathname: string): Meta {
  if (pathname === '/') return { title: 'ホーム', subtitle: todayGreeting() };
  if (pathname.startsWith('/timetable')) return { title: '時間割', subtitle: '2026年度 前期' };
  if (pathname.startsWith('/assignments')) return { title: '課題・提出物', subtitle: '締切と提出状況' };
  if (pathname.startsWith('/bus')) return { title: '交通ダイヤ', subtitle: 'スクールバス・電車のダイヤ' };
  if (pathname.startsWith('/status')) return { title: '出席状況', subtitle: '2026年度 前期' };
  if (pathname.startsWith('/menu')) return { title: 'メニュー', subtitle: 'すべての機能' };
  if (pathname.startsWith('/notifications')) return { title: 'お知らせ', subtitle: 'CIT Portal・manaba・メール を集約' };
  if (pathname.startsWith('/campus')) return { title: 'キャンパス', subtitle: '学内マップ・学年歴・スクールバス' };
  if (pathname.startsWith('/map')) return { title: 'キャンパス', subtitle: '津田沼・新習志野・茜浜' };
  if (pathname.startsWith('/settings')) return { title: '設定', subtitle: '表示・通知・アカウント' };
  if (pathname.startsWith('/attendance')) return { title: '出席登録', subtitle: 'QR出席・確認' };
  return { title: 'ChibaTech Portal', subtitle: '' };
}
