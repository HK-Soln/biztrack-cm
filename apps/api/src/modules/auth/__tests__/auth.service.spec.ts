/// <reference types="jest" />
import { AppBadRequestException, AppConflictException, AppUnauthorizedException } from '@/common/exceptions/app-exceptions'
import { VerificationPurpose } from '@/entities/verification-code.entity'
import { User, UserRole } from '@/entities/user.entity'
import { AuthNextStep, PrefferedPhoneChannel, VerificationChannel } from '@biztrack/types'
import { NodeEnv } from '@/config/configuration'
import { AuthService } from '../auth.service'

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    email: null,
    phone: '+237612345678',
    name: 'Test User',
    passwordHash: null,
    avatarUrl: null,
    role: UserRole.OWNER,
    language: 'en',
    isEmailVerified: false,
    isPhoneVerified: false,
    preferredPhoneChannel: PrefferedPhoneChannel.SMS,
    isActive: true,
    businessId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as User

const makeVerificationRecord = () => ({
  id: 'verif-1',
  codeHash: 'hash',
  expiresAt: new Date(Date.now() + 10 * 60 * 1000),
})

const makeService = () => {
  const usersRepo = {
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  }
  const refreshTokensRepo = {
    create: jest.fn(),
    save: jest.fn(),
    findOne: jest.fn(),
    delete: jest.fn(),
  }
  const verificationCodesRepo = {
    delete: jest.fn(),
    create: jest.fn((input) => input),
    save: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  }
  const jwt = { signAsync: jest.fn() }
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'OTP_TTL_MINUTES') return 10
      if (key === 'NODE_ENV') return NodeEnv.DEVELOPMENT
      return undefined
    }),
  }
  const passwordManager = {
    hashPassword: jest.fn(),
    verifyPassword: jest.fn(),
    hashOtp: jest.fn().mockResolvedValue('hash'),
    verifyOtp: jest.fn().mockResolvedValue(true),
  }
  const logger = {
    setContext: jest.fn(),
    log: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }

  const service = new AuthService(
    usersRepo as any,
    refreshTokensRepo as any,
    verificationCodesRepo as any,
    jwt as any,
    config as any,
    passwordManager as any,
    logger as any,
  )

  jest.spyOn(service as any, 'generateTokens').mockResolvedValue({
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
  })

  return {
    service,
    usersRepo,
    refreshTokensRepo,
    verificationCodesRepo,
    passwordManager,
  }
}

describe('AuthService flow', () => {
  describe('requestLogin', () => {
    it('returns verify_phone when phone is not verified', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({ isPhoneVerified: false })
      usersRepo.findOne.mockResolvedValue(user)

      const result = await service.requestLogin({ phone: user.phone })

      expect(result.nextStep).toBe(AuthNextStep.VERIFY_PHONE)
      expect(result?.verification?.channel).toBe(VerificationChannel.PHONE)
      expect((result as any)?.verification?.delivery).toBe(user.preferredPhoneChannel)
      expect(verificationCodesRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: user.id,
          channel: VerificationChannel.PHONE,
          purpose: VerificationPurpose.VERIFY_PHONE,
        }),
      )
    })

    it('attaches provided email and requires email verification', async () => {
      const { service, usersRepo } = makeService()
      const user = makeUser({ email: null, isPhoneVerified: true })
      const requestedEmail = 'new@example.com'

      usersRepo.findOne.mockImplementation(({ where }) => {
        if (where?.phone) return Promise.resolve(user)
        if (where?.email) return Promise.resolve(null)
        return Promise.resolve(null)
      })

      const result = await service.requestLogin({ phone: user.phone, email: requestedEmail })

      expect(usersRepo.update).toHaveBeenCalledWith(user.id, { email: requestedEmail, isEmailVerified: false })
      expect(result.nextStep).toBe(AuthNextStep.VERIFY_EMAIL)
      expect(result?.verification?.channel).toBe(VerificationChannel.EMAIL)
    })

    it('rejects email mismatch for existing account', async () => {
      const { service, usersRepo } = makeService()
      const user = makeUser({ email: 'owner@example.com', isPhoneVerified: true })
      usersRepo.findOne.mockResolvedValue(user)

      await expect(
        service.requestLogin({ phone: user.phone, email: 'other@example.com' }),
      ).rejects.toMatchObject<AppBadRequestException>({ code: 'EMAIL_MISMATCH' } as any)
    })

    it('rejects email already in use when attaching', async () => {
      const { service, usersRepo } = makeService()
      const user = makeUser({ email: null, isPhoneVerified: true })
      const existingEmailUser = makeUser({ id: 'user-2', email: 'taken@example.com' })

      usersRepo.findOne.mockImplementation(({ where }) => {
        if (where?.phone) return Promise.resolve(user)
        if (where?.email) return Promise.resolve(existingEmailUser)
        return Promise.resolve(null)
      })

      await expect(
        service.requestLogin({ phone: user.phone, email: 'taken@example.com' }),
      ).rejects.toMatchObject<AppConflictException>({ code: 'EMAIL_IN_USE' } as any)
    })

    it('returns password_required when password exists and checks are satisfied', async () => {
      const { service, usersRepo } = makeService()
      const user = makeUser({
        isPhoneVerified: true,
        isEmailVerified: true,
        passwordHash: 'hash',
      })
      usersRepo.findOne.mockResolvedValue(user)

      const result = await service.requestLogin({ phone: user.phone })

      expect(result).toEqual({ nextStep: AuthNextStep.PASSWORD_REQUIRED })
    })

    it('sends login OTP when no password is configured', async () => {
      const { service, usersRepo } = makeService()
      const user = makeUser({ isPhoneVerified: true, isEmailVerified: true, passwordHash: null })
      usersRepo.findOne.mockResolvedValue(user)

      const result = await service.requestLogin({ phone: user.phone })

      expect(result.nextStep).toBe(AuthNextStep.CONFIRM_LOGIN)
      if (result.nextStep === AuthNextStep.CONFIRM_LOGIN) {
        expect((result as any).verification.channel).toBe(VerificationChannel.PHONE)
        expect((result as any).verification.delivery).toBe(user.preferredPhoneChannel)
      }
    })
  })

  describe('verifyPhone', () => {
    it('sends email verification when email exists and is not verified', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({ email: 'user@example.com', isEmailVerified: false, isPhoneVerified: false })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyPhone(user.phone, '123456')

      expect(usersRepo.update).toHaveBeenCalledWith(user.id, { isPhoneVerified: true })
      expect(result.nextStep).toBe(AuthNextStep.VERIFY_EMAIL)
      expect(result?.verification?.channel).toBe(VerificationChannel.EMAIL)
    })

    it('returns password_required when password exists and email is verified', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({
        isPhoneVerified: false,
        isEmailVerified: true,
        passwordHash: 'hash',
      })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyPhone(user.phone, '123456')

      expect(result).toEqual({ nextStep: AuthNextStep.PASSWORD_REQUIRED })
    })

    it('sends login OTP when no password is configured', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({
        isPhoneVerified: false,
        isEmailVerified: true,
        passwordHash: null,
      })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyPhone(user.phone, '123456')

      expect(result.nextStep).toBe(AuthNextStep.CONFIRM_LOGIN)
      if (result.nextStep === AuthNextStep.CONFIRM_LOGIN) {
        expect((result as any).verification.channel).toBe(VerificationChannel.PHONE)
        expect((result as any).verification.delivery).toBe(user.preferredPhoneChannel)
      }
    })
  })

  describe('verifyEmail', () => {
    it('requires phone to be verified first', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({ email: 'user@example.com', isPhoneVerified: false })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      await expect(service.verifyEmail(user.email!, '123456')).rejects.toMatchObject<AppUnauthorizedException>({
        code: 'PHONE_NOT_VERIFIED',
      } as any)
    })

    it('returns password_required when password exists', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({
        email: 'user@example.com',
        isPhoneVerified: true,
        passwordHash: 'hash',
      })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyEmail(user.email!, '123456')

      expect(result).toEqual({ nextStep: AuthNextStep.PASSWORD_REQUIRED })
    })

    it('sends login OTP when no password is configured', async () => {
      const { service, usersRepo, verificationCodesRepo } = makeService()
      const user = makeUser({
        email: 'user@example.com',
        isPhoneVerified: true,
        passwordHash: null,
      })
      usersRepo.findOne.mockResolvedValue(user)
      verificationCodesRepo.findOne.mockResolvedValue(makeVerificationRecord())

      const result = await service.verifyEmail(user.email!, '123456')

      expect(result.nextStep).toBe(AuthNextStep.CONFIRM_LOGIN)
      if (result.nextStep === AuthNextStep.CONFIRM_LOGIN) {
        expect((result as any).verification.channel).toBe(VerificationChannel.PHONE)
        expect((result as any).verification.delivery).toBe(user.preferredPhoneChannel)
      }
    })
  })
})
