import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomBytes } from 'crypto'
// bcryptjs (not bcrypt) — the API's hashing lib; its $2a$ hashes verify with the desktop's
// native bcrypt.compare, so a card hashed here authorizes on-device (BIZ-3.3).
import * as bcrypt from 'bcryptjs'
import { IsNull, Repository } from 'typeorm'
import {
  MemberAuthCredentialType,
  type AuditContext,
  type IssueCardResponse,
  type MemberAuthCredential as MemberAuthCredentialView,
  type SetMemberPinResponse,
} from '@biztrack/types'
import { AppBadRequestException, AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { MemberAuthCredential } from '@/entities/member-auth-credential.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { BusinessMemberStatus, NotificationType } from '@biztrack/types'
import { AuditService } from '@/modules/audit/audit.service'
import { NotificationDispatcher } from '@/modules/notifications/services/notification-dispatcher.service'

/** bcrypt cost for credential hashes — high, since the hash is distributed to devices. */
const CREDENTIAL_BCRYPT_COST = 12
/** Bytes of entropy in a card token (128-bit). */
const CARD_TOKEN_BYTES = 16

/**
 * BIZ-3.3 — the one home for member authorization credentials (PIN + scannable cards). The server
 * stores only the secret hash and never verifies it; verification happens on-device (offline),
 * fed by the sync pull. Card issuance/revocation lands in slice 2.
 */
@Injectable()
export class CredentialsService {
  constructor(
    @InjectRepository(MemberAuthCredential)
    private readonly credRepo: Repository<MemberAuthCredential>,
    @InjectRepository(BusinessMember)
    private readonly membersRepo: Repository<BusinessMember>,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationDispatcher,
  ) {}

  /** Alert the owner of a credential event (BIZ-3.3) — best-effort, prefs-gated (bell + email/SMS
   * per the business's TEAM_ACTIVITY settings). Never blocks the operation. */
  private async alertOwner(businessId: string, title: string, body: string): Promise<void> {
    try {
      await this.notifications.dispatch({
        businessId,
        event: NotificationType.TEAM_ACTIVITY,
        title,
        body,
        deeplink: '/settings?section=security',
      })
    } catch {
      // A notification failure must never fail the credential write.
    }
  }

  /** Set/rotate the current member's PIN. The bcrypt hash is client-computed; the server stores it
   * verbatim as the member's single live PIN credential. */
  async setPin(
    businessId: string,
    userId: string,
    pinHash: string,
    context: AuditContext,
  ): Promise<SetMemberPinResponse> {
    const member = await this.membersRepo.findOne({
      where: { businessId, userId, status: BusinessMemberStatus.ACTIVE },
    })
    if (!member) {
      throw new AppNotFoundException('Membership not found.', 'NOT_FOUND')
    }

    const existing = await this.credRepo.findOne({
      where: { memberId: member.id, type: MemberAuthCredentialType.PIN, revokedAt: IsNull() },
    })
    const version = (existing?.version ?? 0) + 1
    const now = new Date()

    if (existing) {
      await this.credRepo.update(existing.id, { secretHash: pinHash, version })
    } else {
      await this.credRepo.save(
        this.credRepo.create({
          memberId: member.id,
          businessId,
          userId,
          type: MemberAuthCredentialType.PIN,
          secretHash: pinHash,
          version,
          issuedById: null,
          label: null,
          revokedAt: null,
        }),
      )
    }

    this.auditService.log(context, {
      action: 'UPDATE',
      entityType: 'member_auth_credential',
      entityId: member.id,
      entityLabel: 'PIN',
      // Never log the hash — only that a PIN was set and its new version.
      changes: { before: { version: existing?.version ?? 0 }, after: { version } },
    })

    return { memberId: member.id, pinVersion: version, pinSetAt: now.toISOString() }
  }

  /**
   * Issue a scannable card for a member (BIZ-3.3, owner-only — enforced by the controller). The
   * server generates a 128-bit token, stores only its hash, and returns the token ONCE so the
   * client can render/print the QR — it is never persisted in clear and never returned again.
   */
  async issueCard(
    businessId: string,
    issuerUserId: string,
    input: { memberId: string; label?: string | null },
    context: AuditContext,
  ): Promise<IssueCardResponse> {
    const member = await this.membersRepo.findOne({
      where: { id: input.memberId, businessId, status: BusinessMemberStatus.ACTIVE },
    })
    if (!member) {
      throw new AppNotFoundException('Membership not found.', 'NOT_FOUND')
    }

    const token = randomBytes(CARD_TOKEN_BYTES).toString('base64url')
    const secretHash = await bcrypt.hash(token, CREDENTIAL_BCRYPT_COST)

    const saved = await this.credRepo.save(
      this.credRepo.create({
        memberId: member.id,
        businessId,
        userId: member.userId,
        type: MemberAuthCredentialType.CARD,
        secretHash,
        version: 1,
        issuedById: issuerUserId,
        label: input.label?.trim() || null,
        revokedAt: null,
      }),
    )

    this.auditService.log(context, {
      action: 'CREDENTIAL_ISSUED',
      entityType: 'member_auth_credential',
      entityId: saved.id,
      entityLabel: saved.label ?? 'Card',
      changes: { before: null, after: { type: 'CARD', memberId: member.id } },
    })

    await this.alertOwner(
      businessId,
      'Access card issued',
      `A scannable authorization card (${saved.label ?? 'Card'}) was issued.`,
    )

    return { credential: this.toView(saved), token }
  }

  /** Revoke a credential (owner-only). A revoked credential can never authorize again; the change
   * syncs down so a lost card dies on the next pull. */
  async revokeCard(
    businessId: string,
    credentialId: string,
    context: AuditContext,
  ): Promise<MemberAuthCredentialView> {
    const cred = await this.credRepo.findOne({ where: { id: credentialId, businessId } })
    if (!cred) {
      throw new AppNotFoundException('Credential not found.', 'NOT_FOUND')
    }
    if (cred.type === MemberAuthCredentialType.PIN) {
      throw new AppBadRequestException('A PIN is rotated, not revoked.', 'CANNOT_REVOKE_PIN')
    }
    if (!cred.revokedAt) {
      await this.credRepo.update(cred.id, { revokedAt: new Date() })
      cred.revokedAt = new Date()
      this.auditService.log(context, {
        action: 'CREDENTIAL_REVOKED',
        entityType: 'member_auth_credential',
        entityId: cred.id,
        entityLabel: cred.label ?? 'Card',
        changes: { before: { revoked: false }, after: { revoked: true } },
      })
      await this.alertOwner(
        businessId,
        'Access card revoked',
        `An authorization card (${cred.label ?? 'Card'}) was revoked.`,
      )
    }
    return this.toView(cred)
  }

  /** The business's credentials for the owner's management list (never the hash). */
  async listForBusiness(businessId: string): Promise<MemberAuthCredentialView[]> {
    const rows = await this.credRepo.find({
      where: { businessId },
      order: { createdAt: 'DESC' },
    })
    return rows.map((c) => this.toView(c))
  }

  private toView(c: MemberAuthCredential): MemberAuthCredentialView {
    return {
      id: c.id,
      memberId: c.memberId,
      userId: c.userId,
      type: c.type,
      version: c.version,
      label: c.label ?? null,
      issuedById: c.issuedById ?? null,
      createdAt: c.createdAt.toISOString(),
      revokedAt: c.revokedAt ? c.revokedAt.toISOString() : null,
    }
  }

  /** All of a business's credentials updated since the cursor — the sync pull source (BIZ-3.3). */
  async findByBusinessSince(businessId: string, since?: Date): Promise<MemberAuthCredential[]> {
    const qb = this.credRepo
      .createQueryBuilder('c')
      .where('c.businessId = :businessId', { businessId })
    if (since) qb.andWhere('c.updatedAt > :since', { since })
    return qb.getMany()
  }
}
