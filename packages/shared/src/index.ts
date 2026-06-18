export {
  type EncryptedData,
  type EncryptionService,
  createEncryptionService,
  getMasterKey,
} from './lib/encryption';

export {
  type JwtPayload,
  type TokenPair,
  type RefreshTokenRecord,
  type RefreshTokenIssue,
  type RefreshTokenStore,
  type MarkUsedResult,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  getJwtSecret,
  getRefreshTokenPepper,
  hashRefreshToken,
  generateAccessToken,
  verifyAccessToken,
  InMemoryRefreshTokenStore,
  createRefreshToken,
} from './lib/auth';

export {
  containsXss,
  containsSqlInjection,
  containsPathTraversal,
  sanitizeHtml,
  sanitizeExternalText,
  sanitizeRichHtml,
  studentIdSchema,
  registerSchema,
  loginSchema,
  credentialSchema,
  notificationSettingsSchema,
  notificationFilterSchema,
  MAX_INPUT_SIZE,
  isInputTooLarge,
} from './lib/validation';

export {
  type RateLimitConfig,
  type RateLimitResult,
  type RateLimiter,
  InMemoryRateLimiter,
  RATE_LIMITS,
} from './lib/rate-limiter';

export { getClientIp } from './lib/client-ip';

export {
  type RedisClient,
  RedisRateLimiter,
} from './lib/redis-rate-limiter';

export {
  type ScrapedNotification,
  sanitizeScrapedData,
  sanitizeErrorMessage,
  MAX_REDIRECTS,
  RedirectTracker,
  COOKIE_OPTIONS,
} from './lib/scraper-security';

export {
  REQUIRED_SECURITY_HEADERS,
  REQUIRED_CSP_DIRECTIVES,
  buildCspHeader,
  ALLOWED_ORIGINS,
  isOriginAllowed,
  AUTH_REQUIRED_PATHS,
  AUTH_NOT_REQUIRED_PATHS,
} from './lib/security-headers';

export {
  type UserCredentialRow,
  type CredentialStore,
  InMemoryCredentialStore,
} from './lib/credential-store';

export {
  type DecryptedCredentials,
  decryptCredentials,
  withDecryptedCredentials,
} from './lib/credential-decrypt';

export {
  type ScraperSession,
  type ScrapedNotificationItem,
  type ScrapedAssignment,
  type ScraperAdapter,
  type AttendanceMode,
  type AttendanceDecision,
  type AttendancePreview,
  type AttendanceSubmission,
  type AttendanceResult,
  type AttendanceAdapter,
  ScraperError,
  ScraperLoginError,
} from './lib/scraper-adapter';

export {
  type AttendanceSettings,
  attendanceModeSchema,
  attendanceSettingsSchema,
  normalizeAttendanceSettings,
  DEFAULT_ATTENDANCE_MODE,
} from './lib/attendance-settings';

export {
  type AttendanceAutoGuardInput,
  type AttendanceAutoGuardPreNetworkInput,
  type AttendanceAutoGuardResult,
  evaluateAttendanceAutoGuard,
  evaluateAttendanceAutoGuardPreNetwork,
} from './lib/attendance-auto-guard';

export {
  type AuditPhase,
  type AuditOutcome,
  type AttendanceAuditLogInput,
  auditPhaseSchema,
  auditOutcomeSchema,
  toAttendanceAuditLogCreateData,
} from './lib/attendance-audit';

export {
  type AttendanceQrParseResult,
  parseAttendanceQrUrl,
} from './lib/attendance-qr';

export {
  type AttendanceTargetTimetable,
  type AttendanceTargetResolution,
  resolveAttendanceTarget,
} from './lib/attendance-target';

export {
  type ConfirmSubmitGuardInput,
  type ConfirmSubmitGuardResult,
  evaluateConfirmSubmitGuard,
  formatJstYmd,
  CONFIRM_METHOD,
} from './lib/attendance-confirm-guard';

export {
  type ConfirmSubmitInput,
  confirmSubmitInputSchema,
} from './lib/attendance-confirm-input';

export {
  ATTENDANCE_QUEUE_NAME,
  ATTENDANCE_JOB_NAME,
} from './lib/attendance-queue-names';
