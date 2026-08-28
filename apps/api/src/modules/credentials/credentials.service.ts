import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { IsNull, Repository } from 'typeorm'
import {
  MemberAuthCredentialType,
  type AuditContext,
  type SetMemberPinResponse,
} from '@biztrack/types'
import { AppNotFoundException } from '@/common/exceptions/app-exceptions'
import { MemberAuthCredential } from '@/entities/member-auth-credential.entity'
import { BusinessMember } from '@/entities/business-member.entity'
import { BusinessMemberStatus } from '@biztrack/types'
import { AuditService } from '@/modules/audit/audit.service'

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
  ) {}

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

  /** All of a business's credentials updated since the cursor — the sync pull source (BIZ-3.3). */
  async findByBusinessSince(businessId: string, since?: Date): Promise<MemberAuthCredential[]> {
    const qb = this.credRepo
      .createQueryBuilder('c')
      .where('c.businessId = :businessId', { businessId })
    if (since) qb.andWhere('c.updatedAt > :since', { since })
    return qb.getMany()
  }
}
