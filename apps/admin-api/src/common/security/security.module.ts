import { Global, Module } from '@nestjs/common'
import { PasswordManager } from './password-manager'

@Global()
@Module({
  providers: [PasswordManager],
  exports: [PasswordManager],
})
export class SecurityModule {}
