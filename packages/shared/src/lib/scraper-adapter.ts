/**
 * スクレイパーアダプタ インターフェース
 *
 * WHY: HTTP(fetch+cheerio) → Playwright の順で試行するアダプタパターン。
 * HTTPで済めばメモリ消費1/100以下、速度10倍以上。
 * 各外部システム（CIT Portal, manaba）ごとに実装を差し替え可能。
 */

/** スクレイパーのセッション情報 */
export interface ScraperSession {
  cookies: Record<string, string>;
  /** セッションの有効期限（Unix timestamp ms） */
  expiresAt: number;
}

/** お知らせ */
export interface ScrapedNotificationItem {
  externalId: string; // 外部システム上のID（差分検出用）
  title: string;
  body: string;
  url: string;
  publishedAt: Date;
}

/** 課題 */
export interface ScrapedAssignment {
  externalId: string;
  title: string;
  courseName: string;
  dueDate: Date | null;
  url: string;
}

/** 出席登録結果 */
export interface AttendanceResult {
  success: boolean;
  message: string; // '出席完了' | '授業なし' | エラーメッセージ
  classDate: Date;
}

/** 出席アダプタ インターフェース */
export interface AttendanceAdapter {
  readonly name: string;

  /**
   * 教室URLにアクセスしてログイン→出席登録を行う
   * @param roomId - 教室名（例: '8109'）。時間割のroomフィールドと一致
   */
  attend(userId: string, password: string, roomId: string): Promise<AttendanceResult>;

  /** auth_hashによるセッション再利用で出席する（再ログイン不要） */
  attendWithSession(cookies: Record<string, string>, roomId: string): Promise<AttendanceResult>;

  /** 出席システムが稼働しているか確認（CIT_Wi-Fi到達性チェック） */
  healthCheck(): Promise<boolean>;
}

/** スクレイパーアダプタ共通インターフェース */
export interface ScraperAdapter {
  readonly name: string;
  readonly target: 'cit-portal' | 'manaba';

  /**
   * ログインしてセッションを確立する
   * WHY: 認証情報は復号済みの平文を受け取り、使用後の破棄は呼び出し側の責務
   */
  login(userId: string, password: string): Promise<ScraperSession>;

  /** お知らせ一覧を取得する */
  fetchNotifications(session: ScraperSession): Promise<ScrapedNotificationItem[]>;

  /** 課題一覧を取得する（manaba用、CIT Portalはnull） */
  fetchAssignments?(session: ScraperSession): Promise<ScrapedAssignment[]>;

  /** 外部システムが稼働しているか確認する */
  healthCheck(): Promise<boolean>;
}

/** アダプタ生成時のエラー */
export class ScraperError extends Error {
  constructor(
    message: string,
    public readonly target: string,
    public readonly adapter: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'ScraperError';
  }
}

/** ログイン失敗エラー */
export class ScraperLoginError extends ScraperError {
  constructor(target: string, adapter: string, cause?: unknown) {
    // WHY: エラーメッセージに認証情報を含めない
    super(`Login failed for ${target}`, target, adapter, cause);
    this.name = 'ScraperLoginError';
  }
}
