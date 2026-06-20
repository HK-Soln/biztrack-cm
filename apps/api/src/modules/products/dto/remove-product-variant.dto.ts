import { ApiProperty } from '@nestjs/swagger'
import { IsString, MaxLength, MinLength } from 'class-validator'
import type { RemoveProductVariantRequest } from '@biztrack/types'

/** Remove a variant from the catalog. Writes off its remaining stock (a stock-out);
 * the reason is recorded on the movement and the audit trail. */
export class RemoveProductVariantDto implements RemoveProductVariantRequest {
  @ApiProperty({ example: 'Discontinued', description: 'Why the variant is being removed.' })
  @IsString()
  @MinLength(3)
  @MaxLength(280)
  reason!: string
}
