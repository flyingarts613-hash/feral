import pg from 'pg'

// bigint ids/counts come back as numbers (they stay far below 2^53 here).
pg.types.setTypeParser(20, (v) => Number(v))

export function createDb({ databaseUrl, databaseSsl, databasePoolMax = 10 }, log = console) {
  const pool = new pg.Pool({
    connectionString: databaseUrl,
    ssl: databaseSsl ? { rejectUnauthorized: false } : undefined,
    max: databasePoolMax,
    connectionTimeoutMillis: 15_000,
    idleTimeoutMillis: 60_000,
    keepAlive: true,
  })
  // A hosted pooler (e.g. Supabase Supavisor) may drop idle connections; without
  // this listener that error would crash the process. The pool replaces the client.
  pool.on('error', (e) => log.error?.(`database idle client error: ${e.message}`))

  const db = {
    pool,
    query: (text, params) => pool.query(text, params),
    one: async (text, params) => (await pool.query(text, params)).rows[0] ?? null,
    many: async (text, params) => (await pool.query(text, params)).rows,

    // Runs fn inside a transaction. fn receives a client with the same helpers.
    async tx(fn) {
      const client = await pool.connect()
      const c = {
        query: (t, p) => client.query(t, p),
        one: async (t, p) => (await client.query(t, p)).rows[0] ?? null,
        many: async (t, p) => (await client.query(t, p)).rows,
      }
      try {
        await client.query('BEGIN')
        const out = await fn(c)
        await client.query('COMMIT')
        return out
      } catch (e) {
        await client.query('ROLLBACK').catch(() => {})
        throw e
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
  return db
}
