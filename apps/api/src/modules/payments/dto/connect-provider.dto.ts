import { ApiProperty } from '@nestjs/swagger'
import { IsObject, IsString, MaxLength } from 'class-validator'
import type { ConnectPaymentProviderRequest } from '@biztrack/types'

/** Connect/rotate a provider's credentials. `credentials` values are strings keyed by the provider's
 * credential-schema field keys; secret fields are encrypted and never returned. */
export class ConnectProviderDto implements ConnectPaymentProviderRequest {
  @ApiProperty({ description: 'Catalogue provider code, e.g. STRIPE or MTN.' })
  @IsString()
  @MaxLength(40)
  providerCode!: string

  @ApiProperty({ description: 'Credential field values keyed by the provider credential schema.' })
  @IsObject()
  credentials!: Record<string, string>
}
