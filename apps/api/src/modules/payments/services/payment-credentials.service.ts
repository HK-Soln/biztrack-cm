import { Inject, Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomBytes } from 'node:crypto'
import { IsNull, Repository } from 'typeorm'
import {
  PaymentProviderConnectionStatus,
  type AuditContext,
  type BusinessPaymentProviderView,
  type ConnectPaymentProviderRequest,
} from '@biztrack/types'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { BusinessPaymentProvider } from '@/entities/business-payment-provider.entity'
import { PaymentProvider } from '@/entities/payment-provider.entity'
import { AuditService } from '@/modules/audit/audit.service'
import {
  credentialFingerprint,
  decryptCredential,
  encryptCredential,
} from '@/common/security/envelope-crypto'
import { MASTER_KEY_PROVIDER, type MasterKeyProvider } from '@/common/security/master-key.provider'

/** Canonical serialisation for encryption + fingerprint — sorted keys so the same credential set
 * always produces the same fingerprint regardless of input order. */
function canonicalise(credentials: Record<string, string>): string {
  const sorted: Record<string, string> = {}
  for (const key of Object.keys(credentials).sort()) sorted[key] = credentials[key] ?? ''
  return JSON.stringify(sorted)
}

/**
 * Spec 07 §2.2/§10 — stores a merchant's provider credentials envelope-encrypted, and hands the
 * DECRYPTED set to server-side callers (adapters, verification) only. There is NO path that returns
 * a secret to a client: the API view is masked (provider, last-four, fingerprint, status). Every
 * write is OWNER-gated (controller) and audited.
 */
@Injectable()
export class PaymentCredentialsService {
  constructor(
    @InjectRepository(BusinessPaymentProvider)
    private readonly connRepo: Repository<BusinessPaymentProvider>,
    @InjectRepository(PaymentProvider)
    private readonly providerRepo: Repository<PaymentProvider>,
    @Inject(MASTER_KEY_PROVIDER) private readonly keys: MasterKeyProvider,
    private readonly auditService: AuditService,
  ) {}

  /** Connect or rotate a provider's credentials. Stored PENDING_VERIFICATION; the verification
   * lifecycle (build 3) flips it to ACTIVE/FAILED. */
  async connect(
    businessId: string,
    userId: string,
    input: ConnectPaymentProviderRequest,
    context: AuditContext,
  ): Promise<BusinessPaymentProviderView> {
    const provider = await this.providerRepo.findOne({
      where: { code: input.providerCode, isActive: true },
    })
    if (!provider) throw new AppNotFoundException('Unknown payment provider.', 'NOT_FOUND')

    // Every secret/required field the schema declares must be present and non-empty.
    const missing = provider.credentialSchema
      .filter((f) => !input.credentials[f.key]?.trim())
      .map((f) => f.key)
    if (missing.length > 0)
      throw new AppBadRequestException(
        `Missing credential fields: ${missing.join(', ')}.`,
        'PAYMENT_CREDENTIALS_INCOMPLETE',
      )

    const plaintext = canonicalise(input.credentials)
    const keyVersion = this.keys.currentVersion()
    const encryptedCredentials = encryptCredential(
      plaintext,
      this.keys.keyFor(keyVersion),
      businessId,
    )
    const fingerprint = credentialFingerprint(plaintext)

    // last-four comes from the first secret field (so the merchant recognises which key is stored).
    const primarySecret = provider.credentialSchema.find((f) => f.secret)
    const secretValue = primarySecret ? (input.credentials[primarySecret.key] ?? '') : ''
    const lastFour = secretValue ? secretValue.slice(-4) : null

    const existing = await this.connRepo.findOne({
      where: { businessId, providerCode: input.providerCode },
    })

    let saved: BusinessPaymentProvider
    if (existing) {
      // Rotation resets verification; the webhook token is stable across a rotation.
      await this.connRepo.update(existing.id, {
        encryptedCredentials,
        keyVersion,
        fingerprint,
        lastFour,
        status: PaymentProviderConnectionStatus.PENDING_VERIFICATION,
        verifiedMethods: [],
        lastVerifiedAt: null,
        verificationError: null,
      })
      saved = (await this.connRepo.findOne({ where: { id: existing.id } }))!
    } else {
      saved = await this.connRepo.save(
        this.connRepo.create({
          businessId,
          providerCode: input.providerCode,
          encryptedCredentials,
          keyVersion,
          fingerprint,
          lastFour,
          status: PaymentProviderConnectionStatus.PENDING_VERIFICATION,
          verifiedMethods: [],
          webhookToken: randomBytes(24).toString('base64url'),
          createdBy: userId,
        }),
      )
    }

    this.auditService.log(context, {
      action: existing ? 'UPDATE' : 'CREATE',
      entityType: 'business_payment_provider',
      entityId: saved.id,
      entityLabel: input.providerCode,
      // Never log the credential — only that it changed, and the non-secret fingerprint.
      changes: { before: null, after: { providerCode: input.providerCode, fingerprint } },
    })

    return this.toView(saved)
  }

  /** A single connection as a masked view. */
  async getConnectionView(
    businessId: string,
    connectionId: string,
  ): Promise<BusinessPaymentProviderView> {
    const conn = await this.connRepo.findOne({ where: { id: connectionId, businessId } })
    if (!conn) throw new AppNotFoundException('Connection not found.', 'NOT_FOUND')
    return this.toView(conn)
  }

  /** The merchant's connections (masked — never a secret). */
  async listForBusiness(businessId: string): Promise<BusinessPaymentProviderView[]> {
    const rows = await this.connRepo.find({
      where: { businessId, deletedAt: IsNull() },
      order: { createdAt: 'DESC' },
    })
    return rows.map((r) => this.toView(r))
  }

  /** Revoke a connection (owner-only). Soft-delete + status REVOKED so routes referencing it can be
   * disabled by the routing layer (build 4). */
  async revoke(
    businessId: string,
    connectionId: string,
    context: AuditContext,
  ): Promise<BusinessPaymentProviderView> {
    const conn = await this.connRepo.findOne({ where: { id: connectionId, businessId } })
    if (!conn) throw new AppNotFoundException('Connection not found.', 'NOT_FOUND')
    const now = new Date()
    await this.connRepo.update(conn.id, {
      status: PaymentProviderConnectionStatus.REVOKED,
      deletedAt: now,
    })
    conn.status = PaymentProviderConnectionStatus.REVOKED
    conn.deletedAt = now
    this.auditService.log(context, {
      action: 'DELETE',
      entityType: 'business_payment_provider',
      entityId: conn.id,
      entityLabel: conn.providerCode,
      changes: { before: { status: 'ACTIVE' }, after: { status: 'REVOKED' } },
    })
    return this.toView(conn)
  }

  /**
   * SERVER-ONLY — the decrypted credential set for an adapter / verification call. There is NO
   * controller path to this method; provider secrets never leave the server. Returns null if the
   * business has no live connection to the provider.
   */
  async getDecryptedCredentials(
    businessId: string,
    providerCode: string,
  ): Promise<Record<string, string> | null> {
    const conn = await this.connRepo.findOne({
      where: { businessId, providerCode, deletedAt: IsNull() },
    })
    if (!conn) return null
    const plaintext = decryptCredential(
      conn.encryptedCredentials,
      this.keys.keyFor(conn.keyVersion),
      businessId,
    )
    return JSON.parse(plaintext) as Record<string, string>
  }

  private toView(c: BusinessPaymentProvider): BusinessPaymentProviderView {
    return {
      id: c.id,
      providerCode: c.providerCode,
      status: c.status,
      lastFour: c.lastFour,
      fingerprint: c.fingerprint,
      verifiedMethods: c.verifiedMethods ?? [],
      lastVerifiedAt: c.lastVerifiedAt ? c.lastVerifiedAt.toISOString() : null,
      verificationError: c.verificationError,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }
  }
}
