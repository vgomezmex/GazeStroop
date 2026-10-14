// Creates (or re-activates) an administrator account for the admin panel.
//
// Usage:
//   node scripts/create-admin.mjs <ACCESS_CODE> [Full name]
//
// The access code is what the administrator types in "Panel de Administración".
// Run `npx prisma db push` first so that the database exists.
import { PrismaClient } from '@prisma/client'

const [code, ...nameParts] = process.argv.slice(2)
if (!code) {
  console.error('Usage: node scripts/create-admin.mjs <ACCESS_CODE> [Full name]')
  process.exit(1)
}
const name = nameParts.join(' ').trim() || 'Administrador'

const db = new PrismaClient()
try {
  const admin = await db.admin.upsert({
    where: { code },
    update: { active: true, name },
    create: { code, name, role: 'admin' },
  })
  console.log(`Administrator ready: ${admin.name} (code: ${admin.code})`)
} catch (err) {
  console.error('Could not create the administrator:', err.message)
  process.exitCode = 1
} finally {
  await db.$disconnect()
}
