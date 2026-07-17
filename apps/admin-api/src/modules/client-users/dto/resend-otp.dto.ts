import { IsIn, IsOptional } from 'class-validator'

export class ResendOtpDto {
  @IsOptional()
  @IsIn(['PHONE_VERIFY', 'EMAIL_VERIFY'])
  type?: 'PHONE_VERIFY' | 'EMAIL_VERIFY'

  @IsOptional()
  @IsIn(['SMS', 'WHATSAPP', 'EMAIL'])
  channel?: 'SMS' | 'WHATSAPP' | 'EMAIL'
}
