import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min, ValidateNested } from 'class-validator'
import type {
  AddDepositPaymentInput,
  CloseDepositInput,
  CreateDepositInput,
  DepositCloseSettlement,
  DepositTaggedProduct,
} from '@biztrack/types'
import { ListQueryDto } from '@/common/dto/list-query.dto'

class TaggedProductDto implements DepositTaggedProduct {
  @ApiProperty()
  @IsUUID()
  productId!: string

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  productName!: string
}

class InitialDepositDto {
  @ApiProperty({ example: 50000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mobileMoneyReference?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string
}

export class CreateDepositDto implements CreateDepositInput {
  @ApiProperty()
  @IsUUID()
  customerId!: string

  @ApiPropertyOptional({ type: [TaggedProductDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaggedProductDto)
  taggedProducts?: TaggedProductDto[] | null

  @ApiPropertyOptional({ type: InitialDepositDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => InitialDepositDto)
  initialDeposit?: InitialDepositDto | null
}

export class AddDepositPaymentDto implements AddDepositPaymentInput {
  @ApiProperty({ example: 25000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mobileMoneyReference?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string
}

const SETTLEMENTS: DepositCloseSettlement[] = ['NONE', 'REFUND', 'TRANSFER']

export class CloseDepositDto implements CloseDepositInput {
  @ApiProperty({ enum: SETTLEMENTS })
  @IsEnum({ NONE: 'NONE', REFUND: 'REFUND', TRANSFER: 'TRANSFER' })
  settlement!: DepositCloseSettlement

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50)
  method?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  mobileMoneyReference?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string
}

export class ListDepositsQueryDto extends ListQueryDto {
  @ApiPropertyOptional({ enum: ['OPEN', 'CLOSED'] })
  @IsOptional()
  @IsEnum({ OPEN: 'OPEN', CLOSED: 'CLOSED' })
  status?: 'OPEN' | 'CLOSED'
}
