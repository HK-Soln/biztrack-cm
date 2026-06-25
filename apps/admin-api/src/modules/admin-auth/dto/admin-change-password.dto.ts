import { IsString, Matches, MinLength } from 'class-validator'

export class AdminChangePasswordDto {
  @IsString()
  currentPassword!: string

  // Stricter than client: min 12 chars, must include upper, lower, digit, special.
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters.' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'Password must include uppercase, lowercase, a digit, and a special character.',
  })
  newPassword!: string
}
