import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator'

/**
 * Send a message to a recipient via email or WhatsApp, optionally with an app-generated
 * document (e.g. a contact statement) attached as a PDF. When `html` is present it is
 * rendered to PDF server-side with network blocked (anti-SSRF) and attached; when absent
 * a plain text/email message is sent. Dispatched through the notification providers.
 */
export class SendDocumentDto {
  @ApiPropertyOptional({ description: 'Self-contained HTML to render to PDF + attach.' })
  @IsOptional()
  @IsString()
  @MaxLength(2_000_000)
  html?: string | null

  @ApiPropertyOptional({ example: 'statement-jean-dupont' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  filename?: string | null

  @ApiProperty({ example: 'Your account statement is attached.' })
  @IsString()
  @MaxLength(4000)
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
