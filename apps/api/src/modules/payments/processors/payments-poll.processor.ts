import { Injectable, Logger } from '@nestjs/common'
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { Queue, type Job } from 'bullmq'
import { PAYMENT_ATTEMPT_TERMINAL } from '@biztrack/types'
import { PaymentAttempt } from '@/entities/payment-attempt.entity'
import { PaymentInitiationService } from '../services/payment-initiation.service'
import {
  PAYMENTS_QUEUE,
  POLL_ATTEMPT_INTERVAL_MS,
  POLL_PAYMENT_ATTEMPT_JOB,
  type PollPaymentAttemptJobData,
} from '../payments.constants'

/**
 * Spec 07 §7 — the lost-callback safety net. A PENDING request-to-pay is polled on a fixed cadence
 * (reconcileAttempt → getTransaction → applyProviderEvent) until it settles or the window closes, so
 * an order settles even if the provider callback never arrives and the customer closed the tab. The
 * job re-enqueues itself with a delay while still pending; a terminal state (or the deadline) ends it.
 */
@Injectable()
@Processor(PAYMENTS_QUEUE)
export class PaymentsPollProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentsPollProcessor.name)

  constructor(
    @InjectRepository(PaymentAttempt)
    private readonly attempts: Repository<PaymentAttempt>,
    private readonly initiation: PaymentInitiationService,
    @InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue,
  ) {
    super()
  }

  async process(job: Job<PollPaymentAttemptJobData>): Promise<void> {
    if (job.name !== POLL_PAYMENT_ATTEMPT_JOB) return
    const { attemptId, deadline } = job.data
    const attempt = await this.attempts.findOne({ where: { id: attemptId } })
    if (!attempt || PAYMENT_ATTEMPT_TERMINAL.includes(attempt.status)) return

    const settled = await this.initiation.reconcileAttempt(attempt)
    if (PAYMENT_ATTEMPT_TERMINAL.includes(settled.status)) return // done — settle already emitted

    if (Date.now() < deadline) {
      await this.queue.add(POLL_PAYMENT_ATTEMPT_JOB, job.data, { delay: POLL_ATTEMPT_INTERVAL_MS })
    } else {
      this.logger.warn(
        `Attempt ${attemptId} still PENDING at deadline — leaving for reconciliation.`,
      )
    }
  }
}
