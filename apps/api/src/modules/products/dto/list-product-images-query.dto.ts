import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsUUID } from 'class-validator'
import { ListQueryDto } from '@/common/dto/list-query.dto'
import type { ProductImagesQuery } from '@biztrack/types'

/**
 * Query DTO for listing product images. Adds an optional `variantId` scope: when present the
 * list returns that variant's gallery, otherwise the product-level gallery.
 */
export class ListProductImagesQueryDto extends ListQueryDto implements ProductImagesQuery {
  @ApiPropertyOptional({
    description: 'Return a variant’s gallery instead of product-level images.',
  })
  @IsOptional()
  @IsUUID()
  variantId?: string
}
