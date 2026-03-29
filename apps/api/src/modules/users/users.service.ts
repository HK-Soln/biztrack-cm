import { Inject, Injectable } from '@nestjs/common'
import { UsersRepository } from './repositories/users.repository'
import { UpdateUserDto } from './dto/update-user.dto'
import type { Logger, LogMetadata } from '@biztrack/logger'
import { LOGGER } from '@/logger/logger.module'
import { AppException } from '@/common/exceptions/app.exception'
import { AppInternalServerException, AppNotFoundException } from '@/common/exceptions/app-exceptions'

@Injectable()
export class UsersService {
  constructor(
    private usersRepo: UsersRepository,
    @Inject(LOGGER) private logger: Logger,
  ) {
    this.logger.setContext('UsersService')
  }

  async findById(id: string) {
    this.logger.debug('Find user by id', 'UsersService', { id })

    try {
      const user = await this.usersRepo.findOne({
        where: { id },
        select: [
          'id', 'email', 'phone', 'name', 'avatarUrl', 'role',
          'language', 'isEmailVerified', 'isPhoneVerified',
          'businessId', 'createdAt', 'updatedAt',
        ],
      })
      if (!user) throw new AppNotFoundException('User not found', 'USER_NOT_FOUND')
      return user
    } catch (error) {
      this.handleServiceError('findById', error, { id })
    }
  }

  async update(id: string, dto: UpdateUserDto) {
    this.logger.debug('Update user', 'UsersService', { id })

    try {
      await this.usersRepo.update(id, dto)
      return this.findById(id)
    } catch (error) {
      this.handleServiceError('update', error, { id })
    }
  }

  private handleServiceError(action: string, error: unknown, metadata?: LogMetadata): never {
    if (error instanceof AppException) {
      this.logger.warn('UsersService error', 'UsersService', {
        action,
        code: error.code,
        status: error.getStatus(),
        ...(metadata ?? {}),
      })
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unknown error'
    this.logger.error('UsersService unexpected error', 'UsersService', {
      action,
      message,
      ...(metadata ?? {}),
    })

    throw new AppInternalServerException('Something went wrong', 'USERS_SERVICE_ERROR', {
      action,
    })
  }
}
