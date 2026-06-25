import { Injectable } from '@nestjs/common'
import * as bcrypt from 'bcryptjs'
import { ConfigService } from '@nestjs/config'
import type { AppConfig } from '@/config/configuration'

@Injectable()
export class PasswordManager {
  constructor(private config: ConfigService<AppConfig>) {}

  async hashPassword(plain: string): Promise<string> {
    const rounds = this.getSaltRounds()
    const salt = await bcrypt.genSalt(rounds)
    return bcrypt.hash(this.applyPepper(plain), salt)
  }

  async verifyPassword(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(this.applyPepper(plain), hash)
  }

  async hashToken(token: string): Promise<string> {
    const rounds = Math.min(this.getSaltRounds(), 10)
    const salt = await bcrypt.genSalt(rounds)
    return bcrypt.hash(this.applyPepper(token), salt)
  }

  async verifyToken(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(this.applyPepper(token), hash)
  }

  private getSaltRounds(): number {
    return this.config.get('PASSWORD_SALT_ROUNDS', { infer: true }) || 12
  }

  private applyPepper(value: string): string {
    const pepper = this.config.get('PASSWORD_PEPPER', { infer: true })
    return pepper ? `${value}${pepper}` : value
  }
}
