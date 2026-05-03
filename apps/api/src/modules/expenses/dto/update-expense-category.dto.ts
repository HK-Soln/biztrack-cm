import { PartialType } from '@nestjs/mapped-types'
import type { UpdateExpenseCategoryRequest } from '@biztrack/types'
import { CreateExpenseCategoryDto } from './create-expense-category.dto'

export class UpdateExpenseCategoryDto
  extends PartialType(CreateExpenseCategoryDto)
  implements UpdateExpenseCategoryRequest {}
