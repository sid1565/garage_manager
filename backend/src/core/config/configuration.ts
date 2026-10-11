export interface IAppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  apiPrefix: string;
  corsOrigins: string[];
  swaggerEnabled: boolean;
  db: {
    host: string;
    port: number;
    username: string;
    password: string;
    name: string;
    migrationsRun: boolean;
    logging: boolean;
  };
  jwt: {
    privateKey: string;
    publicKey: string;
    keyId: string;
    issuer: string;
    audience: string;
    accessExpiresIn: string;
    refreshTtlDays: number;
  };
  security: {
    cookieSecure: boolean;
    cookieDomain: string | undefined;
    trustProxy: boolean | number;
    bcryptRounds: number;
    loginMaxAttempts: number;
    loginLockMinutes: number;
    throttleLimit: number;
  };
  customerPortal: { url: string; linkTtlDays: number };
  mail: {
    driver: string;
    host: string;
    port: number;
    user: string;
    password: string;
    from: string;
  };
  notifications: { workerEnabled: boolean; pollMs: number };
  sms: { provider: string; twilioSid: string; twilioToken: string; twilioFrom: string };
  storage: { driver: string; localDir: string };
}

const decodePem = (value?: string): string =>
  value ? Buffer.from(value, 'base64').toString('utf8') : '';

const parseTrustProxy = (value?: string): boolean | number => {
  if (value === undefined || value === '' || value === 'false') return false;
  if (value === 'true') return true;
  return Number(value);
};

export default (): IAppConfig => {
  const env = process.env;
  const isProduction = env.NODE_ENV === 'production';
  return {
    nodeEnv: env.NODE_ENV ?? 'development',
    isProduction,
    port: Number(env.PORT ?? 4000),
    apiPrefix: env.API_PREFIX ?? 'api/v1',
    corsOrigins: (env.CORS_ORIGINS ?? '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    swaggerEnabled: !isProduction && env.SWAGGER_ENABLED !== 'false',
    db: {
      host: env.DB_HOST ?? 'localhost',
      port: Number(env.DB_PORT ?? 5432),
      username: env.DB_USERNAME ?? 'postgres',
      password: env.DB_PASSWORD ?? '',
      name: env.DB_NAME ?? 'garage_db',
      // Apply pending migrations on boot (useful for deployments). Off by default.
      migrationsRun: env.DB_MIGRATIONS_RUN === 'true',
      logging: env.DB_LOGGING === 'true',
    },
    jwt: {
      privateKey: decodePem(env.JWT_PRIVATE_KEY),
      publicKey: decodePem(env.JWT_PUBLIC_KEY),
      keyId: env.JWT_KEY_ID ?? '',
      issuer: env.JWT_ISSUER ?? 'garage-api',
      audience: env.JWT_AUDIENCE ?? 'garage-clients',
      accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN ?? '15m',
      refreshTtlDays: Number(env.REFRESH_TOKEN_TTL_DAYS ?? 7),
    },
    security: {
      cookieSecure: env.COOKIE_SECURE === 'true',
      cookieDomain: env.COOKIE_DOMAIN || undefined,
      trustProxy: parseTrustProxy(env.TRUST_PROXY),
      bcryptRounds: Number(env.BCRYPT_ROUNDS ?? 12),
      loginMaxAttempts: Number(env.LOGIN_MAX_ATTEMPTS ?? 5),
      loginLockMinutes: Number(env.LOGIN_LOCK_MINUTES ?? 15),
      throttleLimit: Number(env.THROTTLE_LIMIT ?? 100),
    },
    customerPortal: {
      url: env.CUSTOMER_PORTAL_URL ?? 'http://localhost:3000/portal',
      linkTtlDays: Number(env.CUSTOMER_LINK_TTL_DAYS ?? 7),
    },
    mail: {
      driver: env.MAIL_DRIVER ?? 'log',
      host: env.MAIL_HOST ?? 'localhost',
      port: Number(env.MAIL_PORT ?? 1025),
      user: env.MAIL_USER ?? '',
      password: env.MAIL_PASSWORD ?? '',
      from: env.MAIL_FROM ?? 'Garage <no-reply@garage.local>',
    },
    notifications: {
      workerEnabled: env.NOTIFICATIONS_WORKER_ENABLED !== 'false',
      pollMs: Number(env.NOTIFICATIONS_POLL_MS ?? 5000),
    },
    sms: {
      provider: env.SMS_PROVIDER ?? 'console',
      twilioSid: env.TWILIO_ACCOUNT_SID ?? '',
      twilioToken: env.TWILIO_AUTH_TOKEN ?? '',
      twilioFrom: env.TWILIO_FROM ?? '',
    },
    storage: {
      driver: env.STORAGE_DRIVER ?? 'local',
      localDir: env.STORAGE_LOCAL_DIR ?? './uploads',
    },
  };
};
