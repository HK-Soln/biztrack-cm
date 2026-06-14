import { Controller, Get, Param } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PublicStorefrontService } from './public-storefront.service'

/**
 * Public, unauthenticated storefront API (Phase 3I). Resolves a business by its
 * store slug — no JWT. Consumed by apps/storefront.
 */
@ApiTags('Public storefront')
@Controller('public/stores')
export class PublicStorefrontController {
  constructor(private readonly storefront: PublicStorefrontService) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Storefront configuration' })
  getStore(@Param('slug') slug: string) {
    return this.storefront.getStore(slug)
  }

  @Get(':slug/products')
  @ApiOperation({ summary: 'Published products' })
  listProducts(@Param('slug') slug: string) {
    return this.storefront.listProducts(slug)
  }

  @Get(':slug/categories')
  @ApiOperation({ summary: 'Category tree' })
  getCategories(@Param('slug') slug: string) {
    return this.storefront.getCategories(slug)
  }

  @Get(':slug/products/:productSlug')
  @ApiOperation({ summary: 'Product detail with variants' })
  getProduct(@Param('slug') slug: string, @Param('productSlug') productSlug: string) {
    return this.storefront.getProduct(slug, productSlug)
  }
}
