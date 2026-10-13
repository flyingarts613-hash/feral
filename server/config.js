// Environment configuration. Every secret comes from the environment — nothing
// here is ever sent to the browser. See .env.example for the full list.

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
    passVerifyUrl: (env.PASS_VERIFY_URL || `${appUrl}/verify`).replace(/\/+$/, ''),
    trustProxy: bool(env.TRUST_PROXY, prod),
    corsOrigins: list(env.CORS_ORIGINS),
    serveStatic: bool(env.SERVE_STATIC, true),
    staticDir: env.STATIC_DIR || 'dist',

    databaseUrl: env.DATABASE_URL,
    databaseSsl: bool(env.DATABASE_SSL, false),

    // HMAC key for OTP and token hashes. Long and random; rotating it invalidates
    // live OTPs, customer links and admin sessions (not passes already issued).
    appSecret: env.APP_SECRET,
    cookieSecure: bool(env.COOKIE_SECURE, prod),
    adminSessionHours: int(env.ADMIN_SESSION_HOURS, 12),

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
      qrPath: env.PAYMENT_QR_PATH || '',
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
  if (!cfg.appSecret || cfg.appSecret.length < 32) problems.push('APP_SECRET must be at least 32 random characters')
  if (!['resend', 'smtp', 'dev_outbox', 'test', ''].includes(cfg.email.provider)) problems.push(`Unknown EMAIL_PROVIDER "${cfg.email.provider}"`)
  if (!['twilio_sms', 'twilio_whatsapp', 'whatsapp_cloud', 'test', ''].includes(cfg.notify.provider)) problems.push(`Unknown NOTIFY_PROVIDER "${cfg.notify.provider}"`)
  if (!['static_upi', 'razorpay'].includes(cfg.payment.defaultMode)) problems.push('PAYMENT_MODE must be static_upi or razorpay')

  // Fake/development providers can never run in production; the test provider only under NODE_ENV=test.
  if (prod && ['dev_outbox', 'test'].includes(cfg.email.provider)) problems.push('EMAIL_PROVIDER dev_outbox/test is not allowed in production')
  if (prod && cfg.notify.provider === 'test') problems.push('NOTIFY_PROVIDER test is not allowed in production')
  if (!cfg.test && (cfg.email.provider === 'test' || cfg.notify.provider === 'test')) problems.push('The "test" providers only run under NODE_ENV=test')
  if (prod) {
    if (!cfg.email.provider) problems.push('EMAIL_PROVIDER is required in production (resend or smtp)')
    if (!cfg.email.from) problems.push('EMAIL_FROM is required in production')
    if (!/^https:\/\//.test(cfg.appUrl)) problems.push('APP_URL must be https:// in production')
  }
  if (cfg.email.provider === 'resend' && !cfg.email.resendApiKey) problems.push('RESEND_API_KEY is required for EMAIL_PROVIDER=resend')
  if (cfg.email.provider === 'smtp' && !cfg.email.smtp.host) problems.push('SMTP_HOST is required for EMAIL_PROVIDER=smtp')

  cfg.warnings = []
  if (!cfg.notify.provider) cfg.warnings.push('NOTIFY_PROVIDER is not set — organizer phone alerts will fail until it is configured (pending payments still appear in the dashboard).')
  if (cfg.notify.provider && cfg.notify.provider !== 'test' && !cfg.notify.organizerPhones.length) cfg.warnings.push('ORGANIZER_PHONE is not set (it can also be set in the admin dashboard).')
  if (!cfg.email.provider) cfg.warnings.push('EMAIL_PROVIDER is not set — OTP and pass emails cannot be sent.')

  if (problems.length) {
    const err = new Error('Invalid configuration:\n  - ' + problems.join('\n  - '))
    err.problems = problems
    throw err
  }
  return cfg
}
