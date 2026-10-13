// Outgoing messages are queued in the notifications table inside the same
// transaction as the change that caused them, then delivered by the worker with
// retries. dedupe_key makes every logical message exist once.

export async function enqueue(q, { booking, channel, type, recipient, key, payload = {}, maxAttempts = 6 }) {
  await q.query(
    `INSERT INTO notifications (booking_id, channel, type, recipient, dedupe_key, payload, status, max_attempts)
     VALUES ($1, $2, $3, $4, $5, $6, 'QUEUED', $7)
     ON CONFLICT (dedupe_key) DO NOTHING`,
    [booking?.id ?? null, channel, type, recipient, key, JSON.stringify(payload), maxAttempts],
  )
}

export const backoffSeconds = (attempt) => Math.min(30 * 2 ** (attempt - 1), 1800)

// Claims due messages (and ones whose previous worker died mid-send).
export async function claimDue(db, limit = 10) {
  return db.many(
    `UPDATE notifications SET status = 'SENDING', locked_until = now() + interval '2 minutes', attempts = attempts + 1, updated_at = now()
      WHERE id IN (
        SELECT id FROM notifications
         WHERE (status = 'QUEUED' AND next_attempt_at <= now()) OR (status = 'SENDING' AND locked_until < now())
         ORDER BY next_attempt_at
         LIMIT $1
         FOR UPDATE SKIP LOCKED)
      RETURNING *`,
    [limit],
  )
}

export async function markSent(db, n, { provider, messageId, providerStatus = null }) {
  await db.query(
    `UPDATE notifications SET status = 'SENT', provider = $2, provider_message_id = $3, provider_status = $4,
            sent_at = now(), last_error = NULL, locked_until = NULL, updated_at = now()
      WHERE id = $1 AND status = 'SENDING'`,
    [n.id, provider, messageId, providerStatus],
  )
}

export async function markFailed(db, n, error, provider = null) {
  const final = n.attempts >= n.max_attempts
  await db.query(
    `UPDATE notifications SET status = $2, last_error = $3, provider = COALESCE($5, provider), locked_until = NULL, updated_at = now(),
            next_attempt_at = now() + make_interval(secs => $4)
      WHERE id = $1`,
    [n.id, final ? 'FAILED' : 'QUEUED', String(error).slice(0, 1000), backoffSeconds(n.attempts), provider],
  )
  return final
}

// Admin "retry": only for messages that have given up (or were never sent).
export async function retryNotification(db, id) {
  return db.one(
    `UPDATE notifications SET status = 'QUEUED', attempts = 0, next_attempt_at = now(), last_error = NULL, updated_at = now()
      WHERE id = $1 AND status = 'FAILED' RETURNING *`,
    [id],
  )
}
