import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Brackets, type EntityManager, In, Repository } from 'typeorm'
import { findOnlineCustomer, onlineBuyerKeys } from '@biztrack/domain'
import {
  ContactType,
  type JwtPayload,
  type OnlineCustomer as OnlineCustomerView,
  type OnlineCustomerListResult,
  type OnlineCustomersQuery,
} from '@biztrack/types'
import { Contact } from '@/entities/contact.entity'
import { OnlineCustomer } from '@/entities/online-customer.entity'
import { OnlineOrder } from '@/entities/online-order.entity'
import { AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { ContactsService } from '@/modules/debts/services/contacts.service'

/**
 * Online customers (ruling R20): the people who order from the storefront, kept apart from
 * contacts. Placing an order files it under its buyer; the shop may add a buyer to its
 * contacts, which goes through the contact rules (ruling R16).
 */
@Injectable()
export class OnlineCustomersService {
  constructor(
    @InjectRepository(OnlineCustomer)
    private readonly customersRepo: Repository<OnlineCustomer>,
    @InjectRepository(OnlineOrder)
    private readonly ordersRepo: Repository<OnlineOrder>,
    @InjectRepository(Contact)
    private readonly contactsRepo: Repository<Contact>,
    private readonly contacts: ContactsService,
  ) {}

  /** The online customer a new order belongs to, created for a first-time buyer. */
  async recordOrder(
    manager: EntityManager | null,
    order: Pick<OnlineOrder, 'businessId' | 'customerName' | 'customerPhone' | 'customerEmail'>,
    at: Date,
  ): Promise<OnlineCustomer> {
    const repo = manager ? manager.getRepository(OnlineCustomer) : this.customersRepo
    const keys = onlineBuyerKeys({ phone: order.customerPhone, email: order.customerEmail })
    const candidates = await repo.find({
      where: [
        ...(keys.phone ? [{ businessId: order.businessId, phone: keys.phone }] : []),
        ...(keys.email ? [{ businessId: order.businessId, email: keys.email }] : []),
      ],
    })
    const known = findOnlineCustomer(keys, candidates)
    if (known) {
      known.name = order.customerName
      known.phone = known.phone ?? keys.phone
      known.email = known.email ?? keys.email
      known.orderCount += 1
      known.lastOrderAt = at
      return repo.save(known)
    }
    return repo.save(
      repo.create({
        businessId: order.businessId,
        name: order.customerName,
        phone: keys.phone,
        email: keys.email,
        orderCount: 1,
        firstOrderAt: at,
        lastOrderAt: at,
        contactId: null,
      }),
    )
  }

  async list(businessId: string, query: OnlineCustomersQuery): Promise<OnlineCustomerListResult> {
    const page = Math.max(1, Number(query.page) || 1)
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20))
    const qb = this.customersRepo
      .createQueryBuilder('c')
      .where('c.business_id = :businessId', { businessId })
      .orderBy('c.last_order_at', 'DESC')
      .addOrderBy('c.id', 'ASC')
      .take(limit)
      .skip((page - 1) * limit)
    const search = query.search?.trim()
    if (search) {
      qb.andWhere(
        new Brackets((w) =>
          w
            .where('c.name ILIKE :q', { q: `%${search}%` })
            .orWhere('c.phone ILIKE :q', { q: `%${search}%` })
            .orWhere('c.email ILIKE :q', { q: `%${search}%` }),
        ),
      )
    }
    const [rows, total] = await qb.getManyAndCount()
    return {
      data: await this.toViews(rows),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  }

  async get(businessId: string, id: string): Promise<OnlineCustomerView | null> {
    const row = await this.customersRepo.findOne({ where: { id, businessId } })
    return row ? ((await this.toViews([row]))[0] ?? null) : null
  }

  /**
   * Add an online customer to the contacts, through the contact rules: a name already taken
   * or a phone/email already on a contact is refused (CONTACT_NAME_TAKEN, CONTACT_DUPLICATE)
   * unless `onDuplicate` says to merge or create anyway. Their orders' sales stay as they are.
   */
  async addToContacts(
    businessId: string,
    user: JwtPayload,
    id: string,
    onDuplicate?: 'MERGE' | 'CREATE',
  ): Promise<OnlineCustomerView> {
    const customer = await this.customersRepo.findOne({ where: { id, businessId } })
    if (!customer) {
      throw new AppNotFoundException('Online customer not found.', 'ONLINE_CUSTOMER_NOT_FOUND')
    }
    if (!customer.contactId) {
      const latest = await this.ordersRepo.findOne({
        where: { businessId, onlineCustomerId: id },
        order: { createdAt: 'DESC' },
      })
      const address = [latest?.deliveryAddress, latest?.deliveryCity].filter(Boolean).join(', ')
      const contact = await this.contacts.create(businessId, user, {
        type: ContactType.CUSTOMER,
        name: customer.name,
        phone: customer.phone ?? undefined,
        email: customer.email ?? undefined,
        address: address || undefined,
        onDuplicate,
      })
      await this.customersRepo.update(customer.id, { contactId: contact.id })
    }
    return (await this.get(businessId, id))!
  }

  private async toViews(rows: OnlineCustomer[]): Promise<OnlineCustomerView[]> {
    if (rows.length === 0) return []
    const ids = rows.map((row) => row.id)
    const spent = (await this.ordersRepo
      .createQueryBuilder('o')
      .select('o.online_customer_id', 'id')
      .addSelect('COALESCE(SUM(o.total_amount), 0)', 'total')
      .where('o.online_customer_id IN (:...ids)', { ids })
      .andWhere(`o.status <> 'CANCELLED'`)
      .groupBy('o.online_customer_id')
      .getRawMany()) as Array<{ id: string; total: string }>
    const contactIds = rows.map((row) => row.contactId).filter((x): x is string => !!x)
    const contacts = contactIds.length
      ? await this.contactsRepo.find({ where: { id: In(contactIds) } })
      : []
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      phone: row.phone ?? null,
      email: row.email ?? null,
      orderCount: row.orderCount,
      totalSpent: Number(spent.find((s) => s.id === row.id)?.total ?? 0),
      firstOrderAt: row.firstOrderAt.toISOString(),
      lastOrderAt: row.lastOrderAt.toISOString(),
      contactId: row.contactId ?? null,
      contactName: contacts.find((ct) => ct.id === row.contactId)?.name ?? null,
    }))
  }
}
