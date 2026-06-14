import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { PublicStorefrontService } from './public-storefront.service'
import { OnlineOrdersService } from './online-orders.service'
import {
  AddCartItemDto,
  CheckoutDto,
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
  @ApiOperation({ summary: 'Storefront configuration' })
  getStore(@Param('slug') slug: string) {
    return this.storefront.getStore(slug)
  }

  @Get(':slug/products')
  @ApiOperation({ summary: 'Published products (paginated)' })
  listProducts(@Param('slug') slug: string, @Query() query: PublicProductsQueryDto) {
    return this.storefront.listProducts(slug, query)
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

  // ---- Cart ----------------------------------------------------------------

  @Get(':slug/cart/:sessionToken')
  @ApiOperation({ summary: 'Get the session cart' })
  getCart(@Param('slug') slug: string, @Param('sessionToken') sessionToken: string) {
    return this.orders.getCart(slug, sessionToken)
  }

  @Post(':slug/cart/items')
  @ApiOperation({ summary: 'Add an item to the cart (creates the cart if needed)' })
  addCartItem(@Param('slug') slug: string, @Body() dto: AddCartItemDto) {
    return this.orders.addItem(slug, dto.sessionToken, dto)
  }

  @Patch(':slug/cart/:sessionToken/items/:itemKey')
  @ApiOperation({ summary: 'Update a cart item quantity' })
  updateCartItem(
    @Param('slug') slug: string,
    @Param('sessionToken') sessionToken: string,
    @Param('itemKey') itemKey: string,
    @Body() dto: UpdateCartItemDto,
  ) {
    return this.orders.updateItem(slug, sessionToken, itemKey, dto.quantity)
  }

  @Delete(':slug/cart/:sessionToken/items/:itemKey')
  @ApiOperation({ summary: 'Remove a cart item' })
  removeCartItem(
    @Param('slug') slug: string,
    @Param('sessionToken') sessionToken: string,
    @Param('itemKey') itemKey: string,
  ) {
    return this.orders.removeItem(slug, sessionToken, itemKey)
  }

  @Post(':slug/cart/:sessionToken/checkout')
  @ApiOperation({ summary: 'Place an order from the cart' })
  checkout(
    @Param('slug') slug: string,
    @Param('sessionToken') sessionToken: string,
    @Body() dto: CheckoutDto,
  ) {
    return this.orders.checkout(slug, sessionToken, dto)
  }

  @Get(':slug/orders/:trackingToken')
  @ApiOperation({ summary: 'Track an order by its tracking token' })
  trackOrder(@Param('slug') slug: string, @Param('trackingToken') trackingToken: string) {
    return this.orders.getTracking(slug, trackingToken)
  }
}
