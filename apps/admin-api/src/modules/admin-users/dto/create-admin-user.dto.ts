import { IsEmail, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator'

export class CreateAdminUserDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name!: string

  @IsEmail()
  @MaxLength(255)
  email!: string

  // Stricter than client: min 12 chars, upper + lower + digit + special.
  @IsString()
  @MinLength(12, { message: 'Password must be at least 12 characters.' })
  @Matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/, {
    message: 'Password must include uppercase, lowercase, a digit, and a special character.',
  })
  password!: string

  @IsUUID()
  adminRoleId!: string
}
