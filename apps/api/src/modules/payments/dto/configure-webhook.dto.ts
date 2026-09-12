import { ApiProperty } from '@nestjs/swagger'
import { IsObject } from 'class-validator'
import type { ConfigureWebhookRequest } from '@biztrack/types'

/** Complete webhook setup (step 2) for a connection. `credentials` carries only the provider's
 * `webhook`-marked fields (e.g. a Stripe signing secret); they are merged into the existing
 * encrypted credential set. May be empty for providers with no webhook credential. */
export class ConfigureWebhookDto implements ConfigureWebhookRequest {
  @ApiProperty({ description: 'Webhook credential field values keyed by the provider schema.' })
  @IsObject()
  credentials!: Record<string, string>
}
