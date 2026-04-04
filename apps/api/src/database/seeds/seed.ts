import 'reflect-metadata'
import { AppDataSource } from '../data-source'
import { User } from '../../entities/user.entity'
import { Business, BusinessType, SubscriptionStatus } from '../../entities/business.entity'
import { BusinessMember } from '../../entities/business-member.entity'
import { ProductCategory } from '../../entities/product-category.entity'
import { Product } from '../../entities/product.entity'
import * as bcrypt from 'bcryptjs'
import { SubscriptionPlan, UserRole, BusinessMemberRole, BusinessMemberStatus } from '@biztrack/types'
import { Locale } from '@/common/enums/locale.enum'

async function seed() {
  await AppDataSource.initialize()
  console.log('Seeding database...')

  const usersRepo = AppDataSource.getRepository(User)
  const businessRepo = AppDataSource.getRepository(Business)
  const categoriesRepo = AppDataSource.getRepository(ProductCategory)
  const productsRepo = AppDataSource.getRepository(Product)
  const membersRepo = AppDataSource.getRepository(BusinessMember)

  const passwordHash = await bcrypt.hash('password123', 12)

  // Create or find demo owner
  let owner = await usersRepo.findOne({ where: { email: 'demo@biztrack.cm' } })
  if (!owner) {
    owner = usersRepo.create({
      name: 'Jean Kamga',
      email: 'demo@biztrack.cm',
      passwordHash,
      role: UserRole.OWNER,
      language: Locale.FR,
      isEmailVerified: true,
    })
    await usersRepo.save(owner)
  }

  // Create or find demo business
  let business = await businessRepo.findOne({ where: { ownerId: owner.id } })
  if (!business) {
    business = businessRepo.create({
      name: 'Boutique Kamga',
      slug: 'boutique-kamga',
      city: 'Douala',
      country: 'CM',
      currency: 'XAF',
      ownerId: owner.id,
      plan: SubscriptionPlan.FREE,
      subscriptionStatus: SubscriptionStatus.TRIAL,
      type: BusinessType.BOUTIQUE,
    })
    await businessRepo.save(business)
  }

  const existingMember = await membersRepo.findOne({ where: { businessId: business.id, userId: owner.id } })
  if (!existingMember) {
    await membersRepo.save(
      membersRepo.create({
        businessId: business.id,
        userId: owner.id,
        role: BusinessMemberRole.OWNER,
        status: BusinessMemberStatus.ACTIVE,
      }),
    )
  }

  // Create demo categories
  const catBoissons = await categoriesRepo.findOne({ where: { id: 'cat-boissons-seed' } })
    ?? await categoriesRepo.save(categoriesRepo.create({ id: 'cat-boissons-seed', businessId: business.id, name: 'Boissons' }))

  const catAlimentaire = await categoriesRepo.findOne({ where: { id: 'cat-alimentaire-seed' } })
    ?? await categoriesRepo.save(categoriesRepo.create({ id: 'cat-alimentaire-seed', businessId: business.id, name: 'Alimentaire' }))

  // Create demo products (skip if already exist by barcode)
  const products: Partial<Product>[] = [
    {
      businessId: business.id,
      name: 'Coca-Cola 50cl',
      barcode: '5449000000996',
      price: 500,
      costPrice: 350,
      stockQuantity: 48,
      lowStockThreshold: 12,
      unit: 'piece',
      categoryId: catBoissons.id,
    },
    {
      businessId: business.id,
      name: 'Eau Minerale 1.5L',
      price: 350,
      costPrice: 200,
      stockQuantity: 72,
      lowStockThreshold: 24,
      unit: 'piece',
      categoryId: catBoissons.id,
    },
    {
      businessId: business.id,
      name: 'Pain de mie',
      price: 1200,
      costPrice: 900,
      stockQuantity: 8,
      lowStockThreshold: 5,
      unit: 'piece',
      categoryId: catAlimentaire.id,
    },
  ]

  for (const p of products) {
    const existing = p.barcode
      ? await productsRepo.findOne({ where: { businessId: business.id, barcode: p.barcode } })
      : null
    if (!existing) {
      await productsRepo.save(productsRepo.create(p))
    }
  }

  console.log('Seed complete:', { owner: owner.email, business: business.name })
  await AppDataSource.destroy()
}

seed().catch((err) => {
  console.error(err)
  process.exit(1)
})
