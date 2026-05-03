import { PartialType } from '@nestjs/mapped-types'
import type { UpdateExpenseRequest } from '@biztrack/types'
import { CreateExpenseDto } from './create-expense.dto'

export class UpdateExpenseDto
  extends PartialType(CreateExpenseDto)
  implements UpdateExpenseRequest {}
