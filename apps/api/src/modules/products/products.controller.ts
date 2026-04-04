import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger'
import { ProductsService } from './products.service'
import { CreateProductDto } from './dto/create-product.dto'
import { UpdateProductDto } from './dto/update-product.dto'
import { Phase2Guard } from '../auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'

@ApiTags('Products')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('products')
export class ProductsController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    return this.productsService.create(user.businessId as string, dto)
  }

  @Get()
  @ApiOperation({ summary: 'List all products' })
  @ApiQuery({ name: 'categoryId', required: false })
  findAll(@CurrentUser() user: JwtPayload, @Query('categoryId') categoryId?: string) {
    return this.productsService.findAll(user.businessId as string, { categoryId })
  }

  @Get('low-stock')
  @ApiOperation({ summary: 'Get products at or below their low stock threshold' })
  getLowStock(@CurrentUser() user: JwtPayload) {
    return this.productsService.getLowStockProducts(user.businessId as string)
  }

  @Get('barcode/:barcode')
  @ApiOperation({ summary: 'Find product by barcode (for scanner)' })
  findByBarcode(@CurrentUser() user: JwtPayload, @Param('barcode') barcode: string) {
    return this.productsService.findByBarcode(barcode, user.businessId as string)
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a product by ID' })
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productsService.findById(id, user.businessId as string)
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a product' })
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, user.businessId as string, dto)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a product' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productsService.softDelete(id, user.businessId as string)
  }
}
