import { lookupPass, passState } from '../services/payments.js'
import { adminFromRequest, RANK } from '../services/adminAuth.js'
import { audit, adminActor } from '../services/audit.js'
import { CATEGORY_LABEL, escapeHtml as h, firstName } from '../lib/format.js'
import { safeEqual } from '../lib/security.js'

// What the pass QR opens. To the public it is deliberately minimal: status,
// first name and pass type. On a device signed in to the admin (approver or
// owner) it also shows the full name and a CHECK IN button for the door.

const fmt = (d) => new Date(d).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })

function page({ state, pass, admin, token, note }) {
  const used = pass?.redeemed_at
  const color = state !== 'VALID' ? '#c4202d' : used && admin ? '#e0a526' : '#2fbf71'
  const label = state === 'VALID' && admin && used ? 'ALREADY CHECKED IN' : state
  let sub
  if (state === 'VALID') sub = admin ? `${h(pass.holder_name)} · ${h(CATEGORY_LABEL[pass.category])} · ${h(pass.pass_code)}` : `${h(firstName(pass.holder_name))} · ${h(CATEGORY_LABEL[pass.category])}`
  else sub = state === 'CANCELLED' ? 'This pass has been cancelled.' : 'This QR code is not a FERAL pass.'
  const desk =
    admin && state === 'VALID'
      ? used
        ? `<p class="n">Checked in at ${h(fmt(pass.redeemed_at))} by ${h(pass.redeemed_by || '')}</p>`
        : RANK[admin.role] >= RANK.approver
          ? `<form method="post" action="/verify/${h(token)}/checkin"><input type="hidden" name="csrf" value="${h(admin.csrf)}"><button>CHECK IN</button></form>`
          : ''
      : ''
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>FERAL pass — ${h(label)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#050505;color:#f2f0ec;font-family:Inter,Helvetica,Arial,sans-serif;text-align:center}
.w{padding:32px}.b{font-family:Anton,Impact,sans-serif;font-size:56px;letter-spacing:1px}.s{display:inline-block;margin-top:24px;padding:10px 18px;border:1px solid ${color};color:${color};font-weight:700;letter-spacing:4px}
.n{margin-top:18px;color:#bdb8b2;letter-spacing:2px;font-size:13px}button{margin-top:28px;background:#2fbf71;color:#050505;border:0;font-weight:800;letter-spacing:3px;padding:18px 34px;font-size:16px}
.ok{margin-top:18px;color:#2fbf71;font-weight:700;letter-spacing:2px}</style></head>
<body><div class="w"><div class="b">FERAL</div><div class="s">${h(label)}</div><div class="n">${sub}</div>${note ? `<div class="ok">${h(note)}</div>` : ''}${desk}</div></body></html>`
}

export const verifyRoutes = (ctx) => async (app) => {
  const cfg = { config: { rateLimit: { max: 60 * ctx.cfg.rateLimitScale, timeWindow: 60000 } } }
  app.get('/verify/:token', cfg, async (req, reply) => {
    const pass = await lookupPass(ctx, req.params.token)
    const state = passState(pass)
    const admin = await adminFromRequest(ctx, req)
    const note = req.query?.checked === '1' && pass?.redeemed_at ? 'CHECKED IN' : null
    return reply.code(state === 'INVALID' ? 404 : 200).type('text/html; charset=utf-8').send(page({ state, pass, admin, token: req.params.token, note }))
  })

  app.post('/verify/:token/checkin', cfg, async (req, reply) => {
    const admin = await adminFromRequest(ctx, req)
    if (!admin || RANK[admin.role] < RANK.approver || !safeEqual(String(req.body?.csrf || ''), admin.csrf)) return reply.code(403).send('Not allowed')
    const pass = await lookupPass(ctx, req.params.token)
    if (passState(pass) !== 'VALID') return reply.redirect(`/verify/${encodeURIComponent(req.params.token)}`, 303)
    const r = await ctx.db.one(`UPDATE passes SET redeemed_at = now(), redeemed_by = $2 WHERE id = $1 AND redeemed_at IS NULL RETURNING id`, [pass.id, adminActor(admin)])
    if (r) await audit(ctx.db, { admin, action: 'pass_checked_in', booking: { id: pass.booking_id, booking_code: pass.booking_code }, details: { passCode: pass.pass_code, via: 'qr' }, ip: req.ip })
    return reply.redirect(`/verify/${encodeURIComponent(req.params.token)}?checked=${r ? 1 : 0}`, 303)
  })

  app.get('/api/public/passes/verify/:token', cfg, async (req, reply) => {
    const pass = await lookupPass(ctx, req.params.token)
    const state = passState(pass)
    if (state === 'INVALID') return reply.code(404).send({ status: 'INVALID' })
    return { status: state, firstName: firstName(pass.holder_name), pass: CATEGORY_LABEL[pass.category], checkedIn: Boolean(pass.redeemed_at) }
  })
}
