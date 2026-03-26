/**
 * 入力バリデーション（Zodスキーマ）
 *
 * WHY: 全APIエンドポイントの入力を厳密にバリデーションし、
 * XSS・SQLインジェクション・不正入力を防止する。
 * フロントエンド・バックエンドで同一スキーマを共有する。
 */
import { z } from 'zod';

// --- 危険パターン検出 ---

/** XSSペイロードの代表的パターン */
const XSS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i, // onclick=, onerror= 等
  /<iframe\b/i,
  /<object\b/i,
  /<embed\b/i,
  /<svg\b[^>]*on/i,
  /data:\s*text\/html/i,
  /vbscript:/i,
  /expression\s*\(/i, // CSS expression()
];

/** SQLインジェクションの代表的パターン */
const SQL_INJECTION_PATTERNS = [
  /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE)\b.*\b(FROM|INTO|TABLE|WHERE|SET)\b)/i,
  /(\b(EXEC|EXECUTE)\b\s+\w+)/i, // EXEC xp_cmdshell etc.
  /(['";]\s*--)/,
  /(\bOR\b\s+\d+\s*=\s*\d+)/i, // OR 1=1
  /(\bAND\b\s+\d+\s*=\s*\d+)/i,
  /(SLEEP\s*\()/i, // time-based
  /(BENCHMARK\s*\()/i,
  /(\bWAITFOR\b\s+\bDELAY\b)/i,
];

/** パストラバーサルのパターン */
const PATH_TRAVERSAL_PATTERNS = [
  /\.\.\//,
  /\.\.\\/,
  /%2e%2e/i,
  /%252e%252e/i, // double encoding
];

/**
 * 文字列がXSSペイロードを含むかチェックする
 */
export function containsXss(input: string): boolean {
  return XSS_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * 文字列がSQLインジェクションパターンを含むかチェックする
 */
export function containsSqlInjection(input: string): boolean {
  return SQL_INJECTION_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * 文字列がパストラバーサルパターンを含むかチェックする
 */
export function containsPathTraversal(input: string): boolean {
  return PATH_TRAVERSAL_PATTERNS.some((pattern) => pattern.test(input));
}

/**
 * HTMLタグを除去してサニタイズする
 */
export function sanitizeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

// --- 安全な文字列バリデータ（Zod refine） ---

/** 危険なパターンを含まない安全な文字列を生成するカスタムスキーマ */
function safeString(minLen: number, maxLen: number) {
  return z
    .string()
    .min(minLen)
    .max(maxLen)
    .refine(
      (val) => !containsXss(val) && !containsSqlInjection(val) && !containsPathTraversal(val),
      { message: 'Input contains potentially dangerous content' }
    );
}

// --- スキーマ定義 ---

/**
 * 千葉工大の学籍番号フォーマット
 * WHY: 実測でM24G1140形式と判明。アルファベット1文字 + 年度2桁 + 学科コード1文字 + 番号4桁（計8文字）
 */
export const studentIdSchema = z
  .string()
  .regex(/^[A-Z]\d{2}[A-Z]\d{4}$/, 'Student ID must match format like M24G1140')
  .refine(
    (val) => {
      const year = parseInt(val.substring(1, 3), 10);
      return year >= 0 && year <= 99;
    },
    { message: 'Invalid student ID format' }
  );

/** ユーザー登録スキーマ */
export const registerSchema = z.object({
  studentId: studentIdSchema,
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters'),
  email: z.string().email('Invalid email address').max(254),
});

/** ログインスキーマ */
export const loginSchema = z.object({
  studentId: studentIdSchema,
  password: z.string().min(1).max(128),
});

/** CIT Portal / manaba 認証情報登録スキーマ */
export const credentialSchema = z.object({
  citPortalUserId: safeString(1, 100).optional(),
  citPortalPassword: z.string().min(1).max(256).optional(),
  manabaUserId: safeString(1, 100).optional(),
  manabaPassword: z.string().min(1).max(256).optional(),
});

/** 通知設定スキーマ */
export const notificationSettingsSchema = z.object({
  pushEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  sources: z.array(z.enum(['cit-portal', 'manaba'])),
  quietHoursStart: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format')
    .optional(),
  quietHoursEnd: z
    .string()
    .regex(/^\d{2}:\d{2}$/, 'Must be HH:MM format')
    .optional(),
  email: z.string().email().max(254).optional(),
});

/** お知らせフィルタスキーマ */
export const notificationFilterSchema = z.object({
  source: z.enum(['cit-portal', 'manaba', 'all']).optional(),
  isRead: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  offset: z.number().int().min(0).default(0),
});

/** 最大入力サイズ（バイト） */
export const MAX_INPUT_SIZE = 1024 * 1024; // 1MB

/**
 * リクエストボディのサイズチェック
 */
export function isInputTooLarge(input: string): boolean {
  return Buffer.byteLength(input, 'utf-8') > MAX_INPUT_SIZE;
}
