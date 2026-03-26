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
  type RefreshTokenStore,
  ACCESS_TOKEN_EXPIRY,
  REFRESH_TOKEN_EXPIRY,
  getJwtSecret,
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
  type AttendanceResult,
  type AttendanceAdapter,
  ScraperError,
  ScraperLoginError,
} from './lib/scraper-adapter';
