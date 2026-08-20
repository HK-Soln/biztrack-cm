import { Type } from 'class-transformer'
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator'
import {
  MAX_DAILY_DIGEST_OFFSET_MINUTES,
  NotificationChannel,
  NotificationType,
} from '@biztrack/types'

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

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_DAILY_DIGEST_OFFSET_MINUTES)
  dailyDigestOffsetMinutes?: number
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
