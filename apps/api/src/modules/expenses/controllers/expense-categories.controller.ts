import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import { Resource, type ExpenseCategory, type JwtPayload } from '@biztrack/types'
import { serializeDto, serializeDtos } from '@/common/http/serialization'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { RequireResource, ResourceGuard } from '@/modules/permissions/guards/resource.guard'
import { CreateExpenseCategoryDto } from '../dto/create-expense-category.dto'
import { ExpenseCategoryDto } from '../dto/expense-response.dto'
import { UpdateExpenseCategoryDto } from '../dto/update-expense-category.dto'
import { ExpenseCategoriesService } from '../services/expense-categories.service'

@ApiTags('Expense Categories')
@ApiBearerAuth()
@UseGuards(Phase2Guard, ResourceGuard)
@Controller('expense-categories')
export class ExpenseCategoriesController {
  constructor(private readonly categoriesService: ExpenseCategoriesService) {}

  @Get()
  @RequireResource(Resource.EXPENSES_VIEW)
  @ApiOperation({ summary: 'List system and business expense categories' })
  async findAll(@CurrentUser() user: JwtPayload): Promise<ExpenseCategory[]> {
    return serializeDtos(
      await this.categoriesService.findAll(user.businessId as string),
      (category) => ExpenseCategoryDto.fromEntity(category)!,
    )
  }

  @Post()
  @RequireResource(Resource.EXPENSES_CREATE)
  @ApiOperation({ summary: 'Create a custom expense category' })
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateExpenseCategoryDto,
  ): Promise<ExpenseCategory> {
    return serializeDto(
      ExpenseCategoryDto.fromEntity(
        await this.categoriesService.create(user.businessId as string, user, dto),
      )!,
    )
  }

  @Patch(':id')
  @RequireResource(Resource.EXPENSES_EDIT)
  @ApiOperation({ summary: 'Update a custom expense category' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateExpenseCategoryDto,
  ): Promise<ExpenseCategory> {
    return serializeDto(
      ExpenseCategoryDto.fromEntity(
        await this.categoriesService.update(id, user.businessId as string, user, dto),
      )!,
    )
  }

  @Delete(':id')
  @RequireResource(Resource.EXPENSES_DELETE)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a custom expense category' })
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string): Promise<void> {
    return this.categoriesService.remove(id, user.businessId as string, user)
  }
}
