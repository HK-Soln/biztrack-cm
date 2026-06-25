import { Global, Module } from '@nestjs/common'
import { logger } from '@biztrack/logger'

export const LOGGER = Symbol('LOGGER')

@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      useValue: logger,
    },
  ],
  exports: [LOGGER],
})
export class LoggerModule {}
