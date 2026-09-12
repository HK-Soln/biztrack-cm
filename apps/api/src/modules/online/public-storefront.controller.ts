import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { AppBadRequestException } from '@/common/exceptions/app-exceptions'
import { PublicStorefrontService } from './public-storefront.service'
import { OnlineOrdersService } from './online-orders.service'
import {
  AddCartItemDto,
  CheckoutDto,
  ContactMessageDto,
  PublicProductsQueryDto,
  UpdateCartItemDto,
} from './dto/online-orders.dto'

/**
 * Public, unauthenticated storefront API (Phase 3I). Resolves a business by its
 * store slug — no JWT. Consumed by apps/storefront.
 */
@ApiTags('Public storefront')
@Controller('public/stores')
export class PublicStorefrontController {
  constructor(
    private readonly storefront: PublicStorefrontService,
    private readonly orders: OnlineOrdersService,
  ) {}

  @Get(':slug')
  @ApiOperation({ summary: 'Storefront configuration (add ?preview=1 for the draft config)' })
  getStore(@Param('slug') slug: string, @Query('preview') preview?: string) {
    return this.storefront.getStore(slug, preview === '1')
  }

  @Get(':slug/products')
  @ApiOperation({ summary: 'Published products (paginated)' })
  listProducts(
    @Param('slug') slug: string,
    @Query() query: PublicProductsQueryDto,
    @Query('preview') preview?: string,
  ) {
    return this.storefront.listProducts(slug, query, preview === '1')
  }

  @Get(':slug/categories')
  @ApiOperation({ summary: 'Category tree' })
  getCategories(@Param('slug') slug: string, @Query('preview') preview?: string) {
    return this.storefront.getCategories(slug, preview === '1')
  }

  @Get(':slug/facets')
  @ApiOperation({ summary: 'Available filter facets (brands, models, attribute options)' })
  getFacets(
    @Param('slug') slug: string,
    @Query('categoryIds') categoryIds?: string,
    @Query('preview') preview?: string,
  ) {
    const ids = categoryIds
      ? categoryIds
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean)
      : undefined
    return this.storefront.getFacets(slug, ids, preview === '1')
  }

  @Get(':slug/products/:productSlug')
  @ApiOperation({ summary: 'Product detail with variants' })
  getProduct(
    @Param('slug') slug: string,
    @Param('productSlug') productSlug: string,
    @Query('preview') preview?: string,
  ) {
    return this.storefront.getProduct(slug, productSlug, preview === '1')
  }

  @Post(':slug/contact')
  @ApiOperation({ summary: 'Send a contact-form message to the business (email)' })
  sendContactMessage(@Param('slug') slug: string, @Body() dto: ContactMessageDto) {
    return this.storefront.sendContactMessage(slug, dto)
  }

  // ---- Cart ----------------------------------------------------------------

  @Get(':slug/cart/:sessionToken')
  @ApiOperation({ summary: 'Get the session cart' })
  getCart(
    @Param('slug') slug: string,
    @Param('sessionToken') sessionToken: string,
    @Query('preview') preview?: string,
  ) {
    return this.orders.getCart(slug, sessionToken, preview === '1')
  }

  @Post(':slug/cart/items')
  @ApiOperation({ summary: 'Add an item to the cart (creates the cart if needed)' })
  addCartItem(
    @Param('slug') slug: string,
    @Body() dto: AddCartItemDto,
    @Query('preview') preview?: string,
  ) {
    return this.orders.addItem(slug, dto.sessionToken, dto, preview === '1')
  }

  @Patch(':slug/cart/:sessionToken/items/:itemKey')
  @ApiOperation({ summary: 'Update a cart item quantity' })
  updateCartItem(
    @Param('slug') slug: string,
    @Param('sessionToken') sessionToken: string,
    @Param('itemKey') itemKey: string,
    @Body() dto: UpdateCartItemDto,
    @Query('preview') preview?: string,
  ) {
    return this.orders.updateItem(slug, sessionToken, itemKey, dto.quantity, preview === '1')
  }

  @Delete(':slug/cart/:sessionToken/items/:itemKey')
  @ApiOperation({ summary: 'Remove a cart item' })
  removeCartItem(
    @Param('slug') slug: string,
    @Param('sessionToken') sessionToken: string,
    @Param('itemKey') itemKey: string,
    @Query('preview') preview?: string,
  ) {
    return this.orders.removeItem(slug, sessionToken, itemKey, preview === '1')
  }

  @Post(':slug/cart/:sessionToken/checkout')
  @ApiOperation({ summary: 'Place an order from the cart' })
  checkout(
    @Param('slug') slug: string,
    @Param('sessionToken') sessionToken: string,
    @Body() dto: CheckoutDto,
    @Query('preview') preview?: string,
  ) {
    // Draft preview is render-only — never let it create a real order (the storefront also disables
    // the action, this is the server-side backstop).
    if (preview === '1') {
      throw new AppBadRequestException('Ordering is disabled in preview mode.', 'ONLINE_PREVIEW_READONLY')
    }
    return this.orders.checkout(slug, sessionToken, dto)
  }

  @Get(':slug/orders/:trackingToken')
  @ApiOperation({ summary: 'Track an order by its tracking token' })
  trackOrder(@Param('slug') slug: string, @Param('trackingToken') trackingToken: string) {
    return this.orders.getTracking(slug, trackingToken)
  }
}
