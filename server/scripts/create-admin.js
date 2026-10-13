// Creates (or resets the password of) an admin. No default or hard-coded
// password: you type one (min 12 chars), or a strong one is generated and
// printed once.
//
//   npm run admin:create -- --email you@example.com --name "Your Name" --role owner
//   npm run admin:create -- --email you@example.com --generate
import readline from 'node:readline/promises'
import { parseArgs } from 'node:util'
import { loadConfig } from '../config.js'
import { createDb } from '../db.js'
import { migrate } from '../migrate.js'
import { hashPassword, randomToken } from '../lib/security.js'

const { values } = parseArgs({
  options: {
    email: { type: 'string' },
    name: { type: 'string' },
    role: { type: 'string', default: 'owner' },
    generate: { type: 'boolean', default: false },
  },
})

if (!values.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email)) {
  console.error('Usage: npm run admin:create -- --email you@example.com [--name "Name"] [--role owner|approver|viewer] [--generate]')
  process.exit(1)
}
if (!['owner', 'approver', 'viewer'].includes(values.role)) {
  console.error('--role must be owner, approver or viewer')
  process.exit(1)
}

const cfg = loadConfig()
const db = createDb(cfg)
await migrate(db, { info: () => {} })

let password
if (values.generate) password = randomToken(18)
else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  password = await rl.question('Password (min 12 characters): ')
  rl.close()
}
if (password.length < 12) {
  console.error('Password must be at least 12 characters.')
  process.exit(1)
}

const email = values.email.toLowerCase()
await db.query(
  `INSERT INTO admins (email, name, password_hash, role) VALUES ($1, $2, $3, $4)
   ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, name = EXCLUDED.name, active = true`,
  [email, values.name || email.split('@')[0], await hashPassword(password), values.role],
)
await db.query('DELETE FROM admin_sessions WHERE admin_id = (SELECT id FROM admins WHERE email = $1)', [email])
console.log(`Admin ${email} (${values.role}) is ready.`)
if (values.generate) console.log(`Generated password (shown once — store it in a password manager): ${password}`)
await db.close()
