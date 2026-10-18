import { fileURLToPath } from 'node:url'

// Environment configuration. Every secret comes from the environment — nothing
// here is ever sent to the browser. See .env.example for the full list.

const DEFAULT_QR = fileURLToPath(new URL('./assets/payment-qr.png', import.meta.url))

const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(v))
const int = (v, d) => (v === undefined || v === '' ? d : Number.parseInt(v, 10))
const list = (v) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

export function loadConfig(env = process.env) {
  const nodeEnv = env.NODE_ENV || 'development'
  const prod = nodeEnv === 'production'
  const appUrl = (env.APP_URL || 'http://localhost:8787').replace(/\/+$/, '')

  const cfg = {
    env: nodeEnv,
    prod,
    test: nodeEnv === 'test',
    port: int(env.PORT, 8787),
    host: env.HOST || '0.0.0.0',
    appUrl,
    // Public URL of this server when the site is hosted elsewhere (static host +
    // VITE_API_URL). Download links, the payment QR image and webhooks use it.
    apiUrl: (env.PUBLIC_API_URL || appUrl).replace(/\/+$/, ''),
    passVerifyUrl: (env.PASS_VERIFY_URL || `${(env.PUBLIC_API_URL || appUrl).replace(/\/+$/, '')}/verify`).replace(/\/+$/, ''),
    trustProxy: bool(env.TRUST_PROXY, prod),
    corsOrigins: list(env.CORS_ORIGINS),
    serveStatic: bool(env.SERVE_STATIC, true),
    staticDir: env.STATIC_DIR || 'dist',

    databaseUrl: env.DATABASE_URL,
    databaseSsl: bool(env.DATABASE_SSL, false),
    // Keep this below the database's connection limit (Supabase free session pooler: 15).
    databasePoolMax: Math.max(2, int(env.DATABASE_POOL_MAX, 10)),

    // HMAC key for OTP and token hashes. Long and random; rotating it invalidates
    // live OTPs, customer links and admin sessions (not passes already issued).
    appSecret: env.APP_SECRET,
    cookieSecure: bool(env.COOKIE_SECURE, prod),
    adminSessionHours: int(env.ADMIN_SESSION_HOURS, 12),
    // One-time first-owner setup at /admin/ (see docs/FREE_DEPLOYMENT.md).
    adminSetupToken: env.ADMIN_SETUP_TOKEN || '',
    // Primary admin from the environment (see docs/FREE_DEPLOYMENT.md §6).
    // Prefer ADMIN_PASSWORD_HASH (npm run admin:hash); ADMIN_PASSWORD is hashed
    // in memory at start-up and never written anywhere.
    envAdmin: {
      loginId: (env.ADMIN_LOGIN_ID || '').trim().toLowerCase(),
      passwordHash: (env.ADMIN_PASSWORD_HASH || '').trim(),
      password: env.ADMIN_PASSWORD || '',
    },
    adminLoginMaxFailures: Math.max(3, int(env.ADMIN_LOGIN_MAX_FAILURES, 5)), // per login ID per 15 minutes

    otp: {
      ttlSeconds: int(env.OTP_TTL_SECONDS, 300),
      maxAttempts: int(env.OTP_MAX_ATTEMPTS, 5),
      resendCooldownSeconds: int(env.OTP_RESEND_COOLDOWN_SECONDS, 60),
      maxSendsPerHour: int(env.OTP_MAX_SENDS_PER_HOUR, 5),
    },

    email: {
      provider: env.EMAIL_PROVIDER || '',
      from: env.EMAIL_FROM || '',
      replyTo: env.EMAIL_REPLY_TO || '',
      resendApiKey: env.RESEND_API_KEY || '',
      resendWebhookSecret: env.RESEND_WEBHOOK_SECRET || '',
      smtp: {
        host: env.SMTP_HOST || '',
        port: int(env.SMTP_PORT, 587),
        secure: bool(env.SMTP_SECURE, false),
        user: env.SMTP_USER || '',
        pass: env.SMTP_PASS || '',
      },
      devOutboxDir: env.DEV_OUTBOX_DIR || '.dev-outbox',
    },

    notify: {
      provider: env.NOTIFY_PROVIDER || '',
      organizerPhones: list(env.ORGANIZER_PHONE),
      // Free alternative/addition to phone alerts: the same alert by email.
      organizerEmails: list(env.ORGANIZER_EMAIL).map((e) => e.toLowerCase()),
      twilio: {
        accountSid: env.TWILIO_ACCOUNT_SID || '',
        authToken: env.TWILIO_AUTH_TOKEN || '',
        smsFrom: env.TWILIO_SMS_FROM || '',
        messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID || '',
        whatsappFrom: env.TWILIO_WHATSAPP_FROM || '',
        // Approved Content Template SIDs per alert type (business-initiated WhatsApp needs templates)
        whatsappContentSid: { payment_pending: env.TWILIO_WHATSAPP_CONTENT_SID || '', payment_rejected: env.TWILIO_WHATSAPP_CONTENT_SID_REJECTED || '' },
        statusCallback: bool(env.TWILIO_STATUS_CALLBACK, true),
      },
      whatsappCloud: {
        token: env.WHATSAPP_CLOUD_TOKEN || '',
        phoneNumberId: env.WHATSAPP_CLOUD_PHONE_NUMBER_ID || '',
        template: { payment_pending: env.WHATSAPP_CLOUD_TEMPLATE || '', payment_rejected: env.WHATSAPP_CLOUD_TEMPLATE_REJECTED || '' },
        templateLang: env.WHATSAPP_CLOUD_TEMPLATE_LANG || 'en',
        apiVersion: env.WHATSAPP_CLOUD_API_VERSION || 'v21.0',
        appSecret: env.WHATSAPP_CLOUD_APP_SECRET || '', // verifies delivery-status webhooks
        verifyToken: env.WHATSAPP_CLOUD_VERIFY_TOKEN || '',
      },
    },

    payment: {
      defaultMode: env.PAYMENT_MODE || 'static_upi',
      // The organiser's payment QR ships in server/assets; PAYMENT_QR_PATH points elsewhere, "none" disables it.
      qrPath: env.PAYMENT_QR_PATH === 'none' ? '' : env.PAYMENT_QR_PATH || DEFAULT_QR,
      razorpay: {
        keyId: env.RAZORPAY_KEY_ID || '',
        keySecret: env.RAZORPAY_KEY_SECRET || '',
        webhookSecret: env.RAZORPAY_WEBHOOK_SECRET || '',
      },
      gatewayAutoApprove: bool(env.GATEWAY_AUTO_APPROVE, false),
    },

    uploads: { maxBytes: int(env.UPLOAD_MAX_BYTES, 5 * 1024 * 1024) },
    retention: {
      unverifiedHours: int(env.RETENTION_UNVERIFIED_HOURS, 48),
      screenshotDaysAfterEvent: int(env.RETENTION_SCREENSHOT_DAYS_AFTER_EVENT, 90),
    },
    workerIntervalMs: int(env.WORKER_INTERVAL_MS, 3000),
    rateLimitScale: Math.max(1, int(env.RATE_LIMIT_SCALE, 1)), // tests only; keep 1 in production
    worker: bool(env.WORKER, true),
  }

  const problems = []
  if (!cfg.databaseUrl) problems.push('DATABASE_URL is required')
  if (cfg.adminSetupToken && cfg.adminSetupToken.length < 32) problems.push('ADMIN_SETUP_TOKEN must be at least 32 random characters')
  const ea = cfg.envAdmin
  if (ea.loginId && !/^[a-z0-9@._+-]{3,254}$/.test(ea.loginId)) problems.push('ADMIN_LOGIN_ID may only contain letters, digits and @ . _ + -')
  if (ea.loginId && !ea.passwordHash && !ea.password) problems.push('ADMIN_LOGIN_ID is set but neither ADMIN_PASSWORD_HASH nor ADMIN_PASSWORD is')
  if (!ea.loginId && (ea.passwordHash || ea.password)) problems.push('ADMIN_PASSWORD_HASH / ADMIN_PASSWORD is set but ADMIN_LOGIN_ID is not')
  if (ea.passwordHash && !/^scrypt\$\d+\$\d+\$\d+\$[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+$/.test(ea.passwordHash)) problems.push('ADMIN_PASSWORD_HASH is not a hash made by `npm run admin:hash`')
  if (!ea.passwordHash && ea.password && ea.password.length < 12) problems.push('ADMIN_PASSWORD must be at least 12 characters')
  if (!cfg.appSecret || cfg.appSecret.length < 32) problems.push('APP_SECRET must be at least 32 random characters')
  if (!['resend', 'smtp', 'dev_outbox', 'test', ''].includes(cfg.email.provider)) problems.push(`Unknown EMAIL_PROVIDER "${cfg.email.provider}"`)
  if (!['twilio_sms', 'twilio_whatsapp', 'whatsapp_cloud', 'test', ''].includes(cfg.notify.provider)) problems.push(`Unknown NOTIFY_PROVIDER "${cfg.notify.provider}"`)
  for (const e of cfg.notify.organizerEmails) if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) problems.push(`ORGANIZER_EMAIL "${e}" is not an email address`)
  if (!['static_upi', 'razorpay'].includes(cfg.payment.defaultMode)) problems.push('PAYMENT_MODE must be static_upi or razorpay')

  // Fake/development providers can never run in production; the test provider only under NODE_ENV=test.
  if (prod && ['dev_outbox', 'test'].includes(cfg.email.provider)) problems.push('EMAIL_PROVIDER dev_outbox/test is not allowed in production')
  if (prod && cfg.notify.provider === 'test') problems.push('NOTIFY_PROVIDER test is not allowed in production')
  if (!cfg.test && (cfg.email.provider === 'test' || cfg.notify.provider === 'test')) problems.push('The "test" providers only run under NODE_ENV=test')
  if (prod) {
    if (!cfg.email.provider) problems.push('EMAIL_PROVIDER is required in production (resend or smtp)')
    if (!cfg.email.from) problems.push('EMAIL_FROM is required in production')
    if (!/^https:\/\//.test(cfg.appUrl)) problems.push('APP_URL must be https:// in production')
    if (!/^https:\/\//.test(cfg.apiUrl)) problems.push('PUBLIC_API_URL must be https:// in production')
  }
  if (cfg.email.provider === 'resend' && !cfg.email.resendApiKey) problems.push('RESEND_API_KEY is required for EMAIL_PROVIDER=resend')
  if (cfg.email.provider === 'smtp' && !cfg.email.smtp.host) problems.push('SMTP_HOST is required for EMAIL_PROVIDER=smtp')

  cfg.warnings = []
  if (!cfg.notify.provider && !cfg.notify.organizerEmails.length) cfg.warnings.push('Neither NOTIFY_PROVIDER nor ORGANIZER_EMAIL is set — organizer alerts will fail until one is configured (pending payments still appear in the dashboard).')
  if (cfg.notify.provider && cfg.notify.provider !== 'test' && !cfg.notify.organizerPhones.length) cfg.warnings.push('ORGANIZER_PHONE is not set (it can also be set in the admin dashboard).')
  if (ea.passwordHash && ea.password) cfg.warnings.push('Both ADMIN_PASSWORD_HASH and ADMIN_PASSWORD are set — the hash is used; remove ADMIN_PASSWORD.')
  if (!cfg.email.provider) cfg.warnings.push('EMAIL_PROVIDER is not set — OTP and pass emails cannot be sent.')

  if (problems.length) {
    const err = new Error('Invalid configuration:\n  - ' + problems.join('\n  - '))
    err.problems = problems
    throw err
  }
  return cfg
}
