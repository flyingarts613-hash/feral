// Prints an ADMIN_PASSWORD_HASH value for Render (scrypt, random salt).
// The password is read from the terminal (not echoed) or from stdin, never from
// the command line, so it doesn't end up in shell history.
//
//   npm run admin:hash
import readline from 'node:readline'
import { hashPassword } from '../lib/security.js'

async function readPassword() {
  if (!process.stdin.isTTY) {
    let data = ''
    for await (const chunk of process.stdin) data += chunk
    return data.replace(/\r?\n$/, '')
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true })
  rl._writeToOutput = (s) => rl.output.write(s.includes('Password') ? s : '') // hide what is typed
  const pw = await new Promise((resolve) => rl.question('Password (min 12 characters): ', resolve))
  rl.close()
  process.stdout.write('\n')
  return pw
}

const password = await readPassword()
if (password.length < 12) {
  console.error('Password must be at least 12 characters.')
  process.exit(1)
}
console.log(await hashPassword(password))
