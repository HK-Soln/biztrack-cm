import 'reflect-metadata'
import * as bcrypt from 'bcryptjs'
import { AdminDataSource } from '../data-source'
import { AdminRole } from '@/entities/admin-role.entity'
import { AdminRolePermission } from '@/entities/admin-role-permission.entity'
import { AdminUser } from '@/entities/admin-user.entity'
import {
  FINANCE_DEFAULT,
  SUPPORT_DEFAULT,
  SYSTEM_ROLES,
  TECHNICAL_DEFAULT,
} from '@/common/permissions/admin-permissions'

interface SystemRoleSeed {
  name: string
  description: string
  permissions: string[] // empty for SUPER_ADMIN (the is_super_admin flag drives access)
}

const SYSTEM_ROLE_SEEDS: SystemRoleSeed[] = [
  { name: SYSTEM_ROLES.SUPER_ADMIN, description: 'Full, immutable access to everything.', permissions: [] },
  { name: SYSTEM_ROLES.FINANCE, description: 'Revenue, subscriptions, and payment operations.', permissions: FINANCE_DEFAULT },
  { name: SYSTEM_ROLES.SUPPORT, description: 'Customer accounts, troubleshooting, and resolution.', permissions: SUPPORT_DEFAULT },
  { name: SYSTEM_ROLES.TECHNICAL, description: 'System health, error monitoring, and plan configuration.', permissions: TECHNICAL_DEFAULT },
]

async function hashPassword(plain: string): Promise<string> {
  const rounds = Number(process.env.PASSWORD_SALT_ROUNDS ?? 12)
  const pepper = process.env.PASSWORD_PEPPER ?? ''
  const salt = await bcrypt.genSalt(rounds)
  return bcrypt.hash(`${plain}${pepper}`, salt)
}

async function main() {
  await AdminDataSource.initialize()
  const roleRepo = AdminDataSource.getRepository(AdminRole)
  const permRepo = AdminDataSource.getRepository(AdminRolePermission)
  const userRepo = AdminDataSource.getRepository(AdminUser)

  const roleByName = new Map<string, AdminRole>()

  // 1 + 2. System roles and their default permission rows (idempotent).
  for (const seed of SYSTEM_ROLE_SEEDS) {
    let role = await roleRepo.findOne({ where: { name: seed.name } })
    if (!role) {
      role = roleRepo.create({ name: seed.name, description: seed.description, isSystemRole: true, createdBy: null })
      role = await roleRepo.save(role)
      console.log(`Created system role: ${seed.name}`)
    } else {
      console.log(`System role exists: ${seed.name}`)
    }
    roleByName.set(seed.name, role)

    for (const permission of seed.permissions) {
      const existing = await permRepo.findOne({ where: { adminRoleId: role.id, permission } })
      if (!existing) {
        await permRepo.save(permRepo.create({ adminRoleId: role.id, permission, scope: null }))
      }
    }
  }

  // 3. First SUPER_ADMIN account (only if none exists yet).
  const email = process.env.ADMIN_SEED_EMAIL
  const password = process.env.ADMIN_SEED_PASSWORD
  const superRole = roleByName.get(SYSTEM_ROLES.SUPER_ADMIN)!

  const existingSuper = await userRepo.findOne({ where: { isSuperAdmin: true } })
  if (existingSuper) {
    console.log(`SUPER_ADMIN account already exists (${existingSuper.email}); skipping creation.`)
  } else if (email && password) {
    const admin = userRepo.create({
      name: 'Super Admin',
      email: email.toLowerCase(),
      passwordHash: await hashPassword(password),
      adminRoleId: superRole.id,
      isActive: true,
      isSuperAdmin: true,
      mustChangePassword: true,
      createdBy: null,
    })
    await userRepo.save(admin)
    console.log(`Created first SUPER_ADMIN: ${email} (must change password on first login)`)
  } else {
    console.warn('ADMIN_SEED_EMAIL / ADMIN_SEED_PASSWORD not set — skipping super admin creation.')
  }

  await AdminDataSource.destroy()
  console.log('Admin seed complete.')
}

main().catch(async (error) => {
  console.error('Admin seed failed:', error)
  if (AdminDataSource.isInitialized) await AdminDataSource.destroy()
  process.exit(1)
})
