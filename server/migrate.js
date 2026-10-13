import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations')

// Applies server/migrations/*.sql in order, once each, under an advisory lock so
// two instances starting together cannot race.
export async function migrate(db, log = console) {
  await db.tx(async (c) => {
    await c.query('SELECT pg_advisory_xact_lock(82610261)')
    await c.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
    const done = new Set((await c.many('SELECT name FROM schema_migrations')).map((r) => r.name))
    const files = (await fs.readdir(DIR)).filter((f) => f.endsWith('.sql')).sort()
    for (const f of files) {
      if (done.has(f)) continue
      await c.query(await fs.readFile(path.join(DIR, f), 'utf8'))
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [f])
      log.info?.(`migration applied: ${f}`)
    }
  })
}
