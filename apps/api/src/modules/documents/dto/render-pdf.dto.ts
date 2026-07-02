import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, MaxLength } from 'class-validator'

export class RenderPdfDto {
  @ApiProperty({ description: 'Self-contained (inline-styled) HTML to render to a PDF.' })
  @IsString()
  @MaxLength(2_000_000)
  html!: string

  @ApiPropertyOptional({ description: 'Download filename (without extension).' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  filename?: string
}
