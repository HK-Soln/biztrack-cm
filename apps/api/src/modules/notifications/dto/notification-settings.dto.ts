import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator'
import { NotificationChannel, NotificationType } from '@biztrack/types'

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/

export class NotificationChannelToggleDto {
  @IsEnum(NotificationType)
  event!: NotificationType

  @IsEnum(NotificationChannel)
  channel!: NotificationChannel

  @IsBoolean()
  enabled!: boolean
}

export class UpdateNotificationMatrixDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => NotificationChannelToggleDto)
  @ArrayMaxSize(28)
  toggles!: NotificationChannelToggleDto[]
}

export class UpdateQuietHoursDto {
  @IsBoolean()
  enabled!: boolean

  @Matches(HHMM, { message: 'from must be HH:mm' })
  from!: string

  @Matches(HHMM, { message: 'until must be HH:mm' })
  until!: string

  @IsString()
  @MaxLength(64)
  timezone!: string
}

export class AddNotificationRecipientDto {
  @IsOptional()
  @IsString()
  userId?: string | null

  @IsString()
  @MaxLength(200)
  name!: string

  @IsOptional()
  @IsEmail()
  email?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  smsContact?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  whatsappContact?: string | null
}

export class UpdateRecipientSubscriptionsDto {
  /** `{ [event]: enabled }` — only listed events change. */
  @IsObject()
  subscriptions!: Record<string, boolean>
}

export class UpdateNotificationRecipientDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string

  @IsOptional()
  @IsEmail()
  email?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  smsContact?: string | null

  @IsOptional()
  @IsString()
  @MaxLength(40)
  whatsappContact?: string | null
}
