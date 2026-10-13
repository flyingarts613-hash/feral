// FERAL server: the public site (dist/), the booking API, the admin and the
// delivery worker in one Node process.
//   npm run build && npm start
import { loadConfig } from './config.js'
import { createContext } from './context.js'
import { buildApp } from './app.js'
import { startWorker } from './services/worker.js'

let cfg
try {
  cfg = loadConfig()
} catch (e) {
  console.error(e.message)
  process.exit(1)
}

const app = await (async () => {
  const ctx = await createContext(cfg, { log: { info: (m) => console.log(m), warn: (m) => console.warn(m), error: (...a) => console.error(...a) } })
  const app = await buildApp(ctx)
  ctx.log = app.log
  for (const w of cfg.warnings) app.log.warn(w)
  const stopWorker = cfg.worker ? startWorker(ctx) : () => {}
  const shutdown = async () => {
    stopWorker()
    await app.close()
    await ctx.db.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
  return app
})()

await app.listen({ port: cfg.port, host: cfg.host })
