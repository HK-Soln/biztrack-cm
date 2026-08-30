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
import { Business } from '@/entities/business.entity'
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
    @InjectRepository(Business)
    private readonly businessRepo: Repository<Business>,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationDispatcher,
  ) {}

  /** True when the business still accepts a PIN at step-up (the default). When false the shop is
   * cards-only, so its cards are the only way to authorize — revoking the last one strands it. */
  private async pinAllowed(businessId: string): Promise<boolean> {
    const business = await this.businessRepo.findOne({ where: { id: businessId } })
    const methods = business?.allowedAuthMethods
    return !methods || methods.includes(MemberAuthCredentialType.PIN)
  }

  /** Count a business's live cards (not revoked, not deleted). find/count auto-exclude soft-deletes,
   * and revoke soft-deletes, so this is the count that can still authorize at the till. Public so the
   * business-settings guard can block dropping PIN while the shop has no card. */
  activeCardCount(businessId: string): Promise<number> {
    return this.credRepo.count({
      where: { businessId, type: MemberAuthCredentialType.CARD, revokedAt: IsNull() },
    })
  }

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
    // A shop that upgraded to card scanning (PIN dropped from allowedAuthMethods) no longer accepts
    // PINs — refuse to set one, so no new PIN hash is ever minted or synced (BIZ-3.3 slice 4).
    if (!(await this.pinAllowed(businessId))) {
      throw new AppBadRequestException(
        'This business uses card scanning; the PIN is turned off.',
        'PIN_DISABLED',
      )
    }
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

    // One active card per member (BIZ-3.3). findOne() auto-excludes soft-deleted rows, so a
    // previously revoked card never blocks re-issuing — only a live one does.
    const existingCard = await this.credRepo.findOne({
      where: {
        memberId: member.id,
        type: MemberAuthCredentialType.CARD,
        revokedAt: IsNull(),
      },
    })
    if (existingCard) {
      throw new AppBadRequestException(
        'This member already has an active card. Revoke it before issuing a new one.',
        'CARD_ALREADY_ISSUED',
      )
    }

    const { token, secretHash } = await this.mintCardToken()

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

  /** Revoke a card (owner-only). A revocation is a full delete: the row is soft-deleted (deleted_at
   * set) so it vanishes from every list, and the tombstone rides the sync pull — a lost card dies
   * on the next pull. A card record relates to nothing critical, so it is safe to remove outright. */
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
    // Never strand a cards-only shop: block revoking its last live card while PIN is off. The owner
    // can Replace it instead (revoke + reissue in one step, no gap) or re-enable PIN — either keeps
    // the till able to authorize. A compromised last card is handled by Replace, not revoke.
    if (!(await this.pinAllowed(businessId)) && (await this.activeCardCount(businessId)) <= 1) {
      throw new AppBadRequestException(
        'This is the only authorization card and PIN is turned off. Replace it (or re-enable PIN) instead of revoking, so the till is never left without a way to authorize.',
        'LAST_CARD_CARDS_ONLY',
      )
    }
    const now = new Date()
    // Explicit update (not softDelete) so @UpdateDateColumn bumps updated_at — the pull is
    // cursor-based on updated_at, so the tombstone must move the cursor to reach devices.
    await this.credRepo.update(cred.id, { deletedAt: now, revokedAt: cred.revokedAt ?? now })
    cred.deletedAt = now
    this.auditService.log(context, {
      action: 'CREDENTIAL_REVOKED',
      entityType: 'member_auth_credential',
      entityId: cred.id,
      entityLabel: cred.label ?? 'Card',
      changes: { before: { deleted: false }, after: { deleted: true } },
    })
    await this.alertOwner(
      businessId,
      'Access card revoked',
      `An authorization card (${cred.label ?? 'Card'}) was revoked.`,
    )
    return this.toView(cred)
  }

  /**
   * Replace (rotate) a card in one atomic step (owner-only): the old card is revoked and a fresh
   * one is issued to the SAME member. This is how a compromised card is rotated — it never dips to
   * zero cards (so it works for a cards-only shop's last card, unlike a plain revoke) and it upholds
   * one-active-card-per-member (still exactly one after). The new token is returned once for the QR.
   */
  async replaceCard(
    businessId: string,
    issuerUserId: string,
    credentialId: string,
    input: { label?: string | null },
    context: AuditContext,
  ): Promise<IssueCardResponse> {
    const old = await this.credRepo.findOne({ where: { id: credentialId, businessId } })
    if (!old) {
      throw new AppNotFoundException('Credential not found.', 'NOT_FOUND')
    }
    if (old.type !== MemberAuthCredentialType.CARD) {
      throw new AppBadRequestException('Only a card can be replaced.', 'CANNOT_REPLACE_PIN')
    }
    const member = await this.membersRepo.findOne({
      where: { id: old.memberId, businessId, status: BusinessMemberStatus.ACTIVE },
    })
    if (!member) {
      throw new AppNotFoundException('Membership not found.', 'NOT_FOUND')
    }

    const { token, secretHash } = await this.mintCardToken()
    const now = new Date()
    // Revoke-old + issue-new in one transaction so the business is never momentarily card-less and a
    // failure can't leave two live cards for the member.
    const saved = await this.credRepo.manager.transaction(async (em) => {
      const repo = em.getRepository(MemberAuthCredential)
      await repo.update(old.id, { deletedAt: now, revokedAt: old.revokedAt ?? now })
      return repo.save(
        repo.create({
          memberId: member.id,
          businessId,
          userId: member.userId,
          type: MemberAuthCredentialType.CARD,
          secretHash,
          version: 1,
          issuedById: issuerUserId,
          label: input.label?.trim() || old.label,
          revokedAt: null,
        }),
      )
    })

    this.auditService.log(context, {
      action: 'CREDENTIAL_REVOKED',
      entityType: 'member_auth_credential',
      entityId: old.id,
      entityLabel: old.label ?? 'Card',
      changes: { before: { deleted: false }, after: { deleted: true, replacedBy: saved.id } },
    })
    this.auditService.log(context, {
      action: 'CREDENTIAL_ISSUED',
      entityType: 'member_auth_credential',
      entityId: saved.id,
      entityLabel: saved.label ?? 'Card',
      changes: { before: null, after: { type: 'CARD', memberId: member.id, replaces: old.id } },
    })

    await this.alertOwner(
      businessId,
      'Access card replaced',
      `An authorization card (${saved.label ?? 'Card'}) was replaced; the old one no longer works.`,
    )

    return { credential: this.toView(saved), token }
  }

  /** Mint a fresh 128-bit card token and its stored hash. The token is returned once (for the QR);
   * only the hash is persisted, and the server never verifies it — devices do, offline. */
  private async mintCardToken(): Promise<{ token: string; secretHash: string }> {
    const token = randomBytes(CARD_TOKEN_BYTES).toString('base64url')
    const secretHash = await bcrypt.hash(token, CREDENTIAL_BCRYPT_COST)
    return { token, secretHash }
  }

  /** The business's live credentials for the owner's management list (never the hash). find()
   * auto-excludes soft-deleted (revoked) rows. */
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
