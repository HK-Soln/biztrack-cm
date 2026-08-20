import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsIn, IsString, MaxLength, ValidateIf } from 'class-validator'

/**
 * Send an app-generated document (e.g. a contact statement) to a recipient as a PDF via
 * email or WhatsApp. The HTML is rendered to PDF server-side with network blocked
 * (anti-SSRF) and dispatched through the notification providers.
 */
export class SendDocumentDto {
  @ApiProperty({ description: 'Self-contained HTML to render to PDF.' })
  @IsString()
  @MaxLength(2_000_000)
  html!: string

  @ApiProperty({ example: 'statement-jean-dupont' })
  @IsString()
  @MaxLength(200)
  filename!: string

  @ApiProperty({ example: 'Your account statement is attached.' })
  @IsString()
  @MaxLength(2000)
  message!: string

  @ApiProperty({ example: 'Kamga Store — Statement' })
  @IsString()
  @MaxLength(300)
  subject!: string

  @ApiProperty({ enum: ['email', 'whatsapp'] })
  @IsIn(['email', 'whatsapp'])
  channel!: 'email' | 'whatsapp'

  @ApiPropertyOptional({ description: 'Recipient phone (WhatsApp channel).' })
  @ValidateIf((o) => o.channel === 'whatsapp')
  @IsString()
  @MaxLength(30)
  phone?: string | null

  @ApiPropertyOptional({ description: 'Recipient email (email channel).' })
  @ValidateIf((o) => o.channel === 'email')
  @IsEmail()
  email?: string | null
}
