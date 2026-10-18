import fs from 'node:fs'
import path from 'node:path'
import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import multipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import { ZodError } from 'zod'
import { publicRoutes } from './routes/public.js'
import { adminRoutes } from './routes/admin.js'
import { webhookRoutes } from './routes/webhooks.js'
import { verifyRoutes } from './routes/verify.js'

// Strip anything that could carry a secret from request logs.
const scrub = (url = '') => url.split('?')[0].replace(/\/verify\/[^/]+/, '/verify/[token]').replace(/(passes\/verify\/)[^/]+/, '$1[token]')

export async function buildApp(ctx) {
  const { cfg } = ctx
  const app = Fastify({
    trustProxy: cfg.trustProxy,
    bodyLimit: 1024 * 1024,
    logger: ctx.logger ?? {
      level: cfg.test ? 'silent' : 'info',
      redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-booking-token"]', 'req.headers["x-csrf-token"]'],
      serializers: { req: (r) => ({ method: r.method, url: scrub(r.url), ip: r.ip }) },
    },
  })
  ctx.log = ctx.log ?? app.log

  // Keep the raw body for webhook signature checks.
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body
    if (!body) return done(null, {})
    try {
      done(null, JSON.parse(body))
    } catch {
      done(Object.assign(new Error('Invalid JSON'), { statusCode: 400 }))
    }
  })
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => {
    req.rawBody = body
    done(null, Object.fromEntries(new URLSearchParams(body)))
  })

  await app.register(cookie)
  await app.register(rateLimit, { global: false })
  await app.register(multipart, { limits: { fileSize: cfg.uploads.maxBytes, files: 1, fields: 10, fieldSize: 4096 } })

  // Security headers.
  app.addHook('onSend', async (req, reply, payload) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
    if (cfg.prod) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    const u = req.url
    if (u.startsWith('/api/') || u.startsWith('/verify/')) {
      reply.header('Cache-Control', reply.getHeader('Cache-Control') || 'no-store')
      reply.header('Referrer-Policy', 'no-referrer')
    }
    if (u.startsWith('/admin') || u.startsWith('/api/admin') || u.startsWith('/verify/')) {
      reply.header('X-Frame-Options', 'DENY')
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      )
    }
    return payload
  })

  // Split deployments (static site on another origin) can call the public API.
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin
    if (origin && cfg.corsOrigins.includes(origin) && req.url.startsWith('/api/public/')) {
      reply.header('Access-Control-Allow-Origin', origin)
      reply.header('Vary', 'Origin')
      reply.header('Access-Control-Allow-Headers', 'Content-Type, X-Booking-Token, Idempotency-Key')
      reply.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      if (req.method === 'OPTIONS') return reply.code(204).send()
    }
  })

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      const fields = {}
      for (const i of err.issues) fields[i.path.join('.') || '_'] ??= i.message
      return reply.code(400).send({ error: 'validation', message: 'Please check the highlighted fields.', fields })
    }
    if (err.statusCode === 429 && !err.code?.startsWith?.('otp')) {
      return reply.code(429).send({ error: 'rate_limited', message: 'Too many requests. Please wait a moment and try again.' })
    }
    if (err.expose || (err.statusCode && err.statusCode < 500)) {
      const { statusCode = 400, code, message, field, attemptsLeft, retryAfter, bookingId } = err
      if (retryAfter) reply.header('Retry-After', retryAfter)
      return reply.code(statusCode).send({ error: code || 'bad_request', message, field, attemptsLeft, retryAfter, bookingId })
    }
    req.log.error({ err: err.message, stack: cfg.prod ? undefined : err.stack }, 'request failed')
    return reply.code(500).send({ error: 'server_error', message: 'Something went wrong. Please try again.' })
  })

  app.get('/api/health', async () => {
    await ctx.db.query('SELECT 1')
    return { ok: true }
  })
  await app.register(publicRoutes(ctx), { prefix: '/api/public' })
  await app.register(adminRoutes(ctx), { prefix: '/api/admin' })
  await app.register(webhookRoutes(ctx), { prefix: '/api/webhooks' })
  await app.register(verifyRoutes(ctx))

  // The built site (dist/) — the main page and the /admin page.
  const root = path.resolve(cfg.staticDir)
  if (cfg.serveStatic && fs.existsSync(path.join(root, 'index.html'))) {
    await app.register(fastifyStatic, { root, index: ['index.html'], wildcard: true, setHeaders: (res, p) => {
      if (/[\\/]assets[\\/]/.test(p)) res.header('Cache-Control', 'public, max-age=31536000, immutable') // res is the Fastify reply
    } })
    app.get('/admin', (req, reply) => reply.redirect('/admin/'))
  }
  app.setNotFoundHandler((req, reply) => reply.code(404).send(req.url.startsWith('/api/') ? { error: 'not_found' } : 'Not found'))
  return app
}
