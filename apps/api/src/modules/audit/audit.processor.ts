import { Inject, Injectable } from '@nestjs/common'
import { Processor, WorkerHost } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import type { Job } from 'bullmq'
import { Repository } from 'typeorm'
import type { Logger } from '@biztrack/logger'
import type { AuditContext, AuditData } from '@biztrack/types'
import { AuditLog } from '@/entities/audit-log.entity'
import { LOGGER } from '@/logger/logger.module'
import { AUDIT_QUEUE } from './constants/audit.constants'
import { buildAuditLog } from './audit.service'

@Injectable()
@Processor(AUDIT_QUEUE)
export class AuditProcessor extends WorkerHost {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {
    super()
  }

  async process(job: Job<{ context: AuditContext; data: AuditData }>): Promise<void> {
    const { context, data } = job.data
    if (!context?.businessId) {
      return
    }
    await this.auditRepo.save(this.auditRepo.create(buildAuditLog(context, data)))
  }
}
