/**
 * CIT ポータル SSO 同期の env ベース設定 (単一ユーザー phase 0)。
 *
 * WHY: 統合認証は MFA(TOTP) 必須で、worker が無人同期するには TOTP secret を保持する
 * 必要がある。DB に置くと「暗号化バンドル + master key 流出で MFA を素通りできる」ため、
 * secret は **DB ではなくコンテナの env/secret** に置く方針 (DB 漏洩時のブラスト半径を限定。
 * user 決定: 専用デバイス + 専用プログラム/コンテナ)。単一ユーザーなので per-user DB 保管も不要。
 *
 * 必要 env (docker secret / env_file 経由で worker コンテナに渡す):
 *   - CIT_PORTAL_USER_ID       統合認証 username (学籍 ID)
 *   - CIT_PORTAL_PASSWORD      統合認証パスワード
 *   - CIT_PORTAL_TOTP_SECRET   認証アプリの BASE32 シークレット (表示上の空白は除去される)
 *   - CIT_PORTAL_TOTP_DEVICE   (任意) 複数 TOTP デバイス時に選ぶデバイス名の部分一致
 *   - CIT_PORTAL_SYNC_USER_ID  同期先 DB User.id (syncTimetable の対象)
 * ゲート (いずれも満たすときだけ同期する・fail-closed):
 *   - SCRAPE_ENABLED=true            (マスタ scrape ゲート)
 *   - CIT_TIMETABLE_SYNC_ENABLED=true (本同期の専用ゲート)
 */

export interface CitPortalSyncConfig {
  /** 統合認証 username (学籍 ID) */
  userId: string;
  /** 統合認証パスワード */
  password: string;
  /** BASE32 TOTP シークレット (空白除去・大文字化済) */
  totpSecret: string;
  /** 複数 TOTP デバイス時のデバイス名部分一致 (任意) */
  totpDeviceName: string | null;
  /** 同期先 DB User.id */
  syncUserId: string;
}

/**
 * env から CIT 同期設定を組み立てる。必須項目が 1 つでも欠ければ null (fail-closed)。
 * secret は表示上の区切り空白を除去し大文字化する (authenticator アプリ表記対策)。
 */
export function getCitPortalSyncConfig(): CitPortalSyncConfig | null {
  const userId = process.env.CIT_PORTAL_USER_ID?.trim();
  const password = process.env.CIT_PORTAL_PASSWORD;
  const totpSecret = (process.env.CIT_PORTAL_TOTP_SECRET ?? '')
    .replace(/\s+/g, '')
    .toUpperCase();
  const syncUserId = process.env.CIT_PORTAL_SYNC_USER_ID?.trim();
  if (!userId || !password || !totpSecret || !syncUserId) return null;
  return {
    userId,
    password,
    totpSecret,
    totpDeviceName: process.env.CIT_PORTAL_TOTP_DEVICE?.trim() || null,
    syncUserId,
  };
}

/**
 * CIT 時間割の SSO 自動同期が有効か。SCRAPE_ENABLED + 専用フラグ + creds 揃い の
 * すべてを満たすときだけ true (fail-closed)。どれか欠ければ外部 SSO ログインは走らない。
 */
export function isCitTimetableSyncEnabled(): boolean {
  if (process.env.SCRAPE_ENABLED !== 'true') return false;
  if (process.env.CIT_TIMETABLE_SYNC_ENABLED !== 'true') return false;
  return getCitPortalSyncConfig() !== null;
}
