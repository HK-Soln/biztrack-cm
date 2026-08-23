import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, Matches, ValidateIf } from 'class-validator'

export class UpdateDebtDueDateDto {
  @ApiPropertyOptional({
    example: '2026-05-23',
    nullable: true,
    description: 'Expected payment date (YYYY-MM-DD). Null/empty clears it back to the default.',
  })
  @IsOptional()
  @ValidateIf((o) => o.dueDate !== null && o.dueDate !== '')
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'dueDate must be YYYY-MM-DD' })
  dueDate!: string | null
}
