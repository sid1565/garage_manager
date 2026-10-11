// Runs before every e2e test file (jest setupFiles): isolated DB, high auth throttle
// (lockout/throttle behaviour is asserted explicitly where needed).
process.env.NODE_ENV = 'test';
process.env.DB_NAME = 'garage_db_test';
process.env.DB_MIGRATIONS_RUN = 'true';
process.env.THROTTLE_LIMIT = '10000';
process.env.THROTTLE_AUTH_LIMIT = '10000';
process.env.THROTTLE_PORTAL_LIMIT = '10000';
process.env.BCRYPT_ROUNDS = '10';
process.env.CORS_ORIGINS = 'http://localhost:3000';
// Tests drive the notification worker explicitly (processDueBatch) instead of on a timer.
process.env.NOTIFICATIONS_WORKER_ENABLED = 'false';
process.env.MAIL_DRIVER = 'log';
process.env.STORAGE_LOCAL_DIR = '/tmp/garage-e2e-uploads';
