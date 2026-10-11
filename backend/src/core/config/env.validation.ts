import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().default(4000),
  API_PREFIX: Joi.string().default('api/v1'),
  CORS_ORIGINS: Joi.string().default('http://localhost:3000'),
  SWAGGER_ENABLED: Joi.boolean().default(true),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().default(5432),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  DB_MIGRATIONS_RUN: Joi.boolean().default(false),
  DB_LOGGING: Joi.boolean().default(false),

  // ES256 key pair, base64-encoded PEMs (PKCS#8 private, SPKI public).
  JWT_PRIVATE_KEY: Joi.string().base64().required(),
  JWT_PUBLIC_KEY: Joi.string().base64().required(),
  JWT_KEY_ID: Joi.string().max(64).required(),
  JWT_ISSUER: Joi.string().default('garage-api'),
  JWT_AUDIENCE: Joi.string().default('garage-clients'),
  JWT_ACCESS_EXPIRES_IN: Joi.string()
    .pattern(/^\d+[smh]$/)
    .default('15m'),
  REFRESH_TOKEN_TTL_DAYS: Joi.number().integer().min(1).max(30).default(7),

  // Production must use Secure cookies.
  COOKIE_SECURE: Joi.boolean().when('NODE_ENV', {
    is: 'production',
    then: Joi.valid(true).required(),
    otherwise: Joi.boolean().default(false),
  }),
  COOKIE_DOMAIN: Joi.string().allow('').default(''),
  TRUST_PROXY: Joi.alternatives(Joi.boolean(), Joi.number().integer().min(0)).default(false),
  BCRYPT_ROUNDS: Joi.number().integer().min(10).max(15).default(12),
  LOGIN_MAX_ATTEMPTS: Joi.number().integer().min(3).default(5),
  LOGIN_LOCK_MINUTES: Joi.number().integer().min(1).default(15),
  THROTTLE_LIMIT: Joi.number().integer().min(1).default(100),
  THROTTLE_AUTH_LIMIT: Joi.number().integer().min(1).default(10),
  THROTTLE_PORTAL_LIMIT: Joi.number().integer().min(1).default(30),

  CUSTOMER_PORTAL_URL: Joi.string().uri().required(),
  CUSTOMER_LINK_TTL_DAYS: Joi.number().integer().min(1).default(7),

  // `log` writes emails to the application log (dev/test); `smtp` sends for real.
  MAIL_DRIVER: Joi.string().valid('log', 'smtp').default('log'),
  MAIL_HOST: Joi.string().default('localhost'),
  MAIL_PORT: Joi.number().default(1025),
  MAIL_USER: Joi.string().allow('').default(''),
  MAIL_PASSWORD: Joi.string().allow('').default(''),
  MAIL_FROM: Joi.string().default('Garage <no-reply@garage.local>'),
  SMS_PROVIDER: Joi.string().valid('console', 'twilio').default('console'),
  TWILIO_ACCOUNT_SID: Joi.string().allow('').default(''),
  TWILIO_AUTH_TOKEN: Joi.string().allow('').default(''),
  TWILIO_FROM: Joi.string().allow('').default(''),

  // Only `local` is implemented in v1 (S3 is a tracked follow-up).
  STORAGE_DRIVER: Joi.string().valid('local').default('local'),
  NOTIFICATIONS_WORKER_ENABLED: Joi.boolean().default(true),
  NOTIFICATIONS_POLL_MS: Joi.number().integer().min(500).default(5000),
  STORAGE_LOCAL_DIR: Joi.string().default('./uploads'),
});
