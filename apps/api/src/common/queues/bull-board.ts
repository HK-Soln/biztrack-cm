import type { INestApplication } from '@nestjs/common'
import { getQueueToken } from '@nestjs/bullmq'
import { createBullBoard } from '@bull-board/api'
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter'
import { ExpressAdapter } from '@bull-board/express'
import type { Queue } from 'bullmq'
import { INVENTORY_ALERTS_QUEUE } from '@/modules/inventory/constants/inventory.constants'

export const BULL_BOARD_PATH = '/api/v1/queues'

export function mountBullBoard(app: INestApplication): string {
  const serverAdapter = new ExpressAdapter()
  serverAdapter.setBasePath(BULL_BOARD_PATH)

  const inventoryAlertsQueue = app.get<Queue>(getQueueToken(INVENTORY_ALERTS_QUEUE))

  createBullBoard({
    queues: [new BullMQAdapter(inventoryAlertsQueue)],
    serverAdapter,
  })

  app.use(BULL_BOARD_PATH, serverAdapter.getRouter())

  return BULL_BOARD_PATH
}
