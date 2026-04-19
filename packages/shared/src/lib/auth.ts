/**
 * 認証・セッション管理モジュール
 *
 * WHY: JWTの短寿命（15分）+ Refresh Token でセッションハイジャックのリスクを最小化する。
 * Refresh Tokenはローテーション方式で、使用済みトークンの再利用を検知する。
 *
 * セキュリティ設計:
 * - クッキーには生トークン（UUID）を乗せ、DBにはHMAC-SHA256ハッシュのみ保存する。
 *   DB読み取り権限だけでセッションが奪えないようにする（pepperサーバ側秘匿）。
 * - `markUsedAtomically` は updateMany の原子更新に依拠し、並列リフレッシュで
 *   複数の有効な子トークンが発行されないようにする。
 * - 並列リフレッシュは「正当な多重送信」も含めて family 失効（業界標準の保守側）。
 */
import * as jose from 'jose';
import crypto from 'node:crypto';

export interface JwtPayload {
  sub: string;
  studentId: string;
  iat: number;
  exp: number;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

/**
 * DB 永続化される Refresh Token レコード。
 *
 * WHY: `token` フィールドは **HMAC-SHA256 ハッシュ** を保存する。生トークンは絶対に保存しない。
 * 生トークンは `RefreshTokenIssue.rawToken` としてクッキーにのみ乗る。
 */
export interface RefreshTokenRecord {
  /** HMAC-SHA256(rawToken, REFRESH_TOKEN_PEPPER) の hex 文字列 */
  token: string;
  userId: string;
  expiresAt: Date;
  used: boolean;
  family: string;
}

/**
 * 新しい Refresh Token を発行した結果。
 *
 * WHY: 生トークンを cookie に、ハッシュを DB に、という2用途を型で分離する。
 */
export interface RefreshTokenIssue {
  /** Set-Cookie に乗せる生トークン（絶対に DB に保存しない） */
  rawToken: string;
  /** DB に保存するレコード（`token` は HMAC ハッシュ） */
  record: RefreshTokenRecord;
}

/**
 * `markUsedAtomically` の戻り値（discriminated union）。
 *
 * WHY: route 側で「勝った」「再利用検知」「期限切れ」「存在しない」を曖昧にせず分岐させる。
 */
export type MarkUsedResult =
  | { outcome: 'won'; record: RefreshTokenRecord }
  | { outcome: 'reuse_detected'; family: string }
  | { outcome: 'expired' }
  | { outcome: 'not_found' };

export const ACCESS_TOKEN_EXPIRY = 15 * 60;
export const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60;

export function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not set');
  }
  if (secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return secret;
}

/**
 * Refresh Token ハッシュ用 pepper を取得する。
 *
 * WHY: pepper は DB と分離された秘匿鍵。DB 漏洩時も HMAC を前計算できないようにする。
 * 64 hex 文字（256bit）を強制し、`openssl rand -hex 32` 生成を前提とする。
 */
export function getRefreshTokenPepper(): string {
  const pepper = process.env.REFRESH_TOKEN_PEPPER;
  if (!pepper) {
    throw new Error('REFRESH_TOKEN_PEPPER is not set');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(pepper)) {
    throw new Error('REFRESH_TOKEN_PEPPER must be 64 hex characters (256 bits)');
  }
  return pepper;
}

/**
 * 生トークンを HMAC-SHA256 でハッシュ化する（DB 保存・検索キー用）。
 */
export function hashRefreshToken(rawToken: string): string {
  const pepper = getRefreshTokenPepper();
  return crypto
    .createHmac('sha256', Buffer.from(pepper, 'hex'))
    .update(rawToken)
    .digest('hex');
}

// --- JWT アクセストークン ---

export async function generateAccessToken(
  payload: { sub: string; studentId: string },
  secret: Uint8Array
): Promise<string> {
  return new jose.SignJWT({
    sub: payload.sub,
    studentId: payload.studentId,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + ACCESS_TOKEN_EXPIRY)
    .sign(secret);
}

export async function verifyAccessToken(
  token: string,
  secret: Uint8Array
): Promise<JwtPayload> {
  const { payload } = await jose.jwtVerify(token, secret);
  return payload as unknown as JwtPayload;
}

// --- Refresh Token ストア ---

/**
 * Refresh Token ストアの契約。
 *
 * WHY: **すべての public API は生トークン（rawToken）を受け取る**。
 * HMAC 化はストア内部で行い、アプリ層には hash/raw の認知負荷を出さない。
 */
export interface RefreshTokenStore {
  save(record: RefreshTokenRecord): Promise<void>;
  findByRawToken(rawToken: string): Promise<RefreshTokenRecord | null>;
  /**
   * 生トークンを原子的に使用済みにする。race loser は `reuse_detected` を受け取る
   * （正当な並列使用も family 失効の対象。これは保守的設計の意図）。
   */
  markUsedAtomically(rawToken: string): Promise<MarkUsedResult>;
  revokeFamily(family: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

/**
 * インメモリ Refresh Token ストア（テスト・ローカル用）。
 *
 * WHY: `markUsedAtomically` の内部で await を挟まず、同期的に read-modify-write する。
 * JS の single-threaded 性質により、Promise 境界を含まなければ原子的に振る舞う。
 */
export class InMemoryRefreshTokenStore implements RefreshTokenStore {
  private tokens: Map<string, RefreshTokenRecord> = new Map();

  async save(record: RefreshTokenRecord): Promise<void> {
    this.tokens.set(record.token, record);
  }

  async findByRawToken(rawToken: string): Promise<RefreshTokenRecord | null> {
    const hash = hashRefreshToken(rawToken);
    return this.tokens.get(hash) ?? null;
  }

  async markUsedAtomically(rawToken: string): Promise<MarkUsedResult> {
    const hash = hashRefreshToken(rawToken);
    const record = this.tokens.get(hash);

    if (!record) return { outcome: 'not_found' };
    if (record.expiresAt <= new Date()) return { outcome: 'expired' };
    if (record.used) return { outcome: 'reuse_detected', family: record.family };

    // WHY: 同期ブロックで read-check-write する。await を挟まないため JS 実行境界内で原子的
    record.used = true;
    return { outcome: 'won', record: { ...record } };
  }

  async revokeFamily(family: string): Promise<void> {
    for (const [key, record] of this.tokens) {
      if (record.family === family) {
        this.tokens.delete(key);
      }
    }
  }

  async revokeAllForUser(userId: string): Promise<void> {
    for (const [key, record] of this.tokens) {
      if (record.userId === userId) {
        this.tokens.delete(key);
      }
    }
  }
}

/**
 * 新しい Refresh Token を発行する。
 *
 * WHY: 生トークンはクッキー用、`record.token` はHMACハッシュでDB保存用。両用途を型で分離。
 */
export function createRefreshToken(userId: string, family?: string): RefreshTokenIssue {
  const rawToken = crypto.randomUUID();
  return {
    rawToken,
    record: {
      token: hashRefreshToken(rawToken),
      userId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000),
      used: false,
      family: family ?? crypto.randomUUID(),
    },
  };
}
