export async function audit(q, { admin = null, actor, action, booking = null, from = null, to = null, details = {}, ip = null }) {
  await q.query(
    `INSERT INTO audit_logs (admin_id, actor, action, booking_id, booking_code, from_status, to_status, details, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [admin?.id ?? null, actor ?? (admin ? `${admin.name} <${admin.email}>` : 'system'), action, booking?.id ?? null, booking?.booking_code ?? null, from, to, JSON.stringify(details), ip],
  )
}

export const adminActor = (admin) => `${admin.name} <${admin.email}>`
