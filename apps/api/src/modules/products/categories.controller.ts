import {
  Controller, Get, Post, Delete,
  Body, Param, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth, ApiProperty } from '@nestjs/swagger'
import { IsString, MinLength } from 'class-validator'
import { ProductsService } from './products.service'
import { Phase2Guard } from '../auth/guards/phase2.guard'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import type { JwtPayload } from '@biztrack/types'

class CreateCategoryDto {
  @ApiProperty({ example: 'Boissons' })
  @IsString()
  @MinLength(1)
  name!: string
}

@ApiTags('Product Categories')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('product-categories')
export class CategoriesController {
  constructor(private productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a product category' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCategoryDto) {
    return this.productsService.createCategory(user.businessId as string, dto.name)
  }

  @Get()
  @ApiOperation({ summary: 'List all categories' })
  findAll(@CurrentUser() user: JwtPayload) {
    return this.productsService.findCategories(user.businessId as string)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Soft-delete a category' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.productsService.deleteCategory(id, user.businessId as string)
  }
}
