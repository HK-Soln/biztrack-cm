# i18n — Full Backend Implementation
**BizTrack CM · NestJS · nestjs-i18n**

---

## 1. Installation

```bash
pnpm add nestjs-i18n
```

## 1.5 Locale Resolution Priority Order

| Priority | Source | Example | Notes |
|----------|--------|---------|-------|
| 1 | DB user locale | `user.locale = 'fr'` | Authenticated requests only |
| 2 | `req.query.locale` | `?locale=en` | All requests — great for testing |
| 3 | `req.body.locale` | `{ locale: 'fr' }` | Registration + unauthenticated |
| 4 | `Accept-Language` header | `Accept-Language: en-US` | Browser/client default |
| 5 | Default | `en` (dev) · `fr` (prod) | Final fallback |

---

## 2. File Structure

```
apps/api/src/
├── i18n/
│   ├── en/
│   │   ├── auth.json
│   │   ├── plans.json
│   │   ├── errors.json
│   │   ├── notifications.json
│   │   └── validation.json
│   └── fr/
│       ├── auth.json
│       ├── plans.json
│       ├── errors.json
│       ├── notifications.json
│       └── validation.json
│
├── common/
│   ├── enums/
│   │   └── locale.enum.ts
│   ├── resolvers/
│   │   └── user-locale.resolver.ts    ← custom resolver
│   └── filters/
│       └── i18n-exception.filter.ts   ← global exception filter
```

---

## 3. Locale Enum

```typescript
// apps/api/src/common/enums/locale.enum.ts
export enum Locale {
  EN = 'en',
  FR = 'fr',
}

export const DEFAULT_LOCALE =
  process.env.NODE_ENV === 'production' ? Locale.FR : Locale.EN
export const SUPPORTED_LOCALES = [Locale.EN, Locale.FR]
```

---

## 4. User Entity — Add Locale Column

```typescript
// Add to User entity
import { Locale } from '../../../common/enums/locale.enum'

@Column({
  type: 'enum',
  enum: Locale,
  default: Locale.FR,
})
locale: Locale
```

---

## 5. Custom Locale Resolver

This is the key piece — it tells nestjs-i18n where to get the locale from on each request.

```typescript
// apps/api/src/common/resolvers/user-locale.resolver.ts
import { Injectable, ExecutionContext } from '@nestjs/common'
import { I18nResolver, I18nContext } from 'nestjs-i18n'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '../../modules/auth/entities/user.entity'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '../enums/locale.enum'

@Injectable()
export class UserLocaleResolver implements I18nResolver {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) {}

  async resolve(context: ExecutionContext): Promise<string> {
    const req = context.switchToHttp().getRequest()

    // 1. Authenticated request — use saved user locale
    if (req.user?.sub) {
      const user = await this.usersRepo.findOne({
        where: { id: req.user.sub },
        select: ['locale'],
      })
      if (user?.locale) return user.locale
    }

    // 2. Query param — ?locale=en or ?locale=fr
    // Useful for testing and unauthenticated requests
    const queryLocale = req.query?.locale
    if (queryLocale && SUPPORTED_LOCALES.includes(queryLocale)) {
      return queryLocale
    }

    // 3. Locale passed explicitly in request body (during registration)
    if (req.body?.locale && SUPPORTED_LOCALES.includes(req.body.locale)) {
      return req.body.locale
    }

    // 4. Accept-Language header
    const acceptLang = req.headers['accept-language']
    if (acceptLang) {
      const preferred = acceptLang.split(',')[0].split('-')[0].toLowerCase()
      if (SUPPORTED_LOCALES.includes(preferred as any)) return preferred
    }

    // 5. Default — fr in production, en in development
    return DEFAULT_LOCALE
  }
}
```

---

## 6. App Module Setup

```typescript
// apps/api/src/app.module.ts
import { Module } from '@nestjs/common'
import { I18nModule, AcceptLanguageResolver } from 'nestjs-i18n'
import * as path from 'path'
import { UserLocaleResolver } from './common/resolvers/user-locale.resolver'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './modules/auth/entities/user.entity'

@Module({
  imports: [
    I18nModule.forRootAsync({
      useFactory: () => ({
        fallbackLanguage: 'fr',
        loaderOptions: {
          path: path.join(__dirname, '/i18n/'),
          watch: process.env.NODE_ENV === 'development',
        },
        typesOutputPath: path.join(__dirname, '../src/generated/i18n.generated.ts'),
      }),
      resolvers: [
        UserLocaleResolver,           // priority 1 — DB user locale
        AcceptLanguageResolver,       // priority 2 — header fallback
      ],
      imports: [TypeOrmModule.forFeature([User])],
      inject: [],
    }),
  ],
})
export class AppModule {}
```

---

## 7. Translation Files

### `i18n/fr/auth.json`
```json
{
  "register": {
    "success": "Code envoyé au {phone}",
    "phone_exists": "Un compte avec ce numéro existe déjà.",
    "email_exists": "Un compte avec cet email existe déjà."
  },
  "otp": {
    "invalid": "Code invalide.",
    "expired": "Code expiré. Demandez un nouveau code.",
    "max_attempts": "Trop de tentatives. Demandez un nouveau code.",
    "sent_phone": "Code envoyé au {phone}",
    "sent_email": "Code envoyé à {email}",
    "attempts_left": "{count} tentative(s) restante(s)."
  },
  "login": {
    "invalid_credentials": "Identifiants invalides.",
    "account_locked": "Compte temporairement bloqué. Réessayez après {time}.",
    "too_many_attempts": "Trop de tentatives. Compte bloqué pendant 1 heure.",
    "success": "Connexion réussie."
  },
  "token": {
    "invalid": "Session invalide. Reconnectez-vous.",
    "expired": "Session expirée. Reconnectez-vous.",
    "reuse_detected": "Session compromise détectée. Reconnectez-vous."
  },
  "logout": {
    "success": "Déconnexion réussie."
  },
  "verify": {
    "phone_success": "Numéro de téléphone vérifié.",
    "email_success": "Adresse email vérifiée."
  }
}
```

### `i18n/en/auth.json`
```json
{
  "register": {
    "success": "Code sent to {phone}",
    "phone_exists": "An account with this phone number already exists.",
    "email_exists": "An account with this email already exists."
  },
  "otp": {
    "invalid": "Invalid code.",
    "expired": "Code expired. Please request a new one.",
    "max_attempts": "Too many attempts. Please request a new code.",
    "sent_phone": "Code sent to {phone}",
    "sent_email": "Code sent to {email}",
    "attempts_left": "{count} attempt(s) remaining."
  },
  "login": {
    "invalid_credentials": "Invalid credentials.",
    "account_locked": "Account temporarily locked. Try again after {time}.",
    "too_many_attempts": "Too many attempts. Account locked for 1 hour.",
    "success": "Login successful."
  },
  "token": {
    "invalid": "Invalid session. Please log in again.",
    "expired": "Session expired. Please log in again.",
    "reuse_detected": "Compromised session detected. Please log in again."
  },
  "logout": {
    "success": "Logged out successfully."
  },
  "verify": {
    "phone_success": "Phone number verified.",
    "email_success": "Email address verified."
  }
}
```

### `i18n/fr/errors.json`
```json
{
  "not_found": "Ressource introuvable.",
  "unauthorized": "Accès non autorisé.",
  "forbidden": "Accès refusé.",
  "plan_upgrade_required": "Cette fonctionnalité nécessite le plan {plan}.",
  "wrong_onboarding_step": "Veuillez compléter les étapes précédentes.",
  "validation_failed": "Données invalides.",
  "server_error": "Une erreur est survenue. Veuillez réessayer.",
  "rate_limited": "Trop de requêtes. Réessayez dans {seconds} secondes."
}
```

### `i18n/en/errors.json`
```json
{
  "not_found": "Resource not found.",
  "unauthorized": "Unauthorized.",
  "forbidden": "Access denied.",
  "plan_upgrade_required": "This feature requires the {plan} plan.",
  "wrong_onboarding_step": "Please complete the previous steps.",
  "validation_failed": "Invalid data.",
  "server_error": "An error occurred. Please try again.",
  "rate_limited": "Too many requests. Try again in {seconds} seconds."
}
```

### `i18n/fr/plans.json`
```json
{
  "selected": "Plan {plan} activé — {days} jours gratuits.",
  "free_selected": "Plan gratuit activé.",
  "upgraded": "Plan mis à jour vers {plan}.",
  "downgraded": "Passage au plan {plan} à la fin de la période.",
  "cancelled": "Abonnement annulé. Actif jusqu'au {date}.",
  "trial_ending_soon": "Votre essai expire dans {days} jours.",
  "trial_ended": "Votre essai a expiré. Passez à un plan payant pour continuer."
}
```

### `i18n/en/plans.json`
```json
{
  "selected": "{plan} plan activated — {days} days free.",
  "free_selected": "Free plan activated.",
  "upgraded": "Plan upgraded to {plan}.",
  "downgraded": "Downgrade to {plan} plan at end of current period.",
  "cancelled": "Subscription cancelled. Active until {date}.",
  "trial_ending_soon": "Your trial expires in {days} days.",
  "trial_ended": "Your trial has expired. Upgrade to continue."
}
```

### `i18n/fr/notifications.json`
```json
{
  "otp_sms": "BizTrack CM: Votre code est {code}. Valide 10 minutes.",
  "otp_whatsapp": "Votre code de vérification BizTrack CM est *{code}*. Valide 10 minutes. Ne le partagez pas.",
  "trial_ending_soon": "Bonjour {name}, votre essai BizTrack CM expire dans {days} jours. Configurez votre paiement pour continuer.",
  "trial_ended": "Bonjour {name}, votre essai BizTrack CM a expiré. Votre compte est maintenant sur le plan gratuit.",
  "payment_failed": "BizTrack CM: Échec du paiement pour le plan {plan}. Veuillez mettre à jour votre moyen de paiement.",
  "welcome": "Bienvenue sur BizTrack CM, {name}! Votre compte est prêt. Notre équipe est disponible sur WhatsApp: {support_number}"
}
```

### `i18n/en/notifications.json`
```json
{
  "otp_sms": "BizTrack CM: Your code is {code}. Valid for 10 minutes.",
  "otp_whatsapp": "Your BizTrack CM verification code is *{code}*. Valid for 10 minutes. Do not share it.",
  "trial_ending_soon": "Hi {name}, your BizTrack CM trial expires in {days} days. Set up payment to continue.",
  "trial_ended": "Hi {name}, your BizTrack CM trial has ended. Your account is now on the free plan.",
  "payment_failed": "BizTrack CM: Payment failed for {plan} plan. Please update your payment method.",
  "welcome": "Welcome to BizTrack CM, {name}! Your account is ready. Our team is available on WhatsApp: {support_number}"
}
```

### `i18n/fr/validation.json`
```json
{
  "phone_format": "Format requis: +237 6XXXXXXXX ou +237 9XXXXXXXX",
  "password_strength": "Minimum 8 caractères avec au moins une majuscule, une minuscule et un chiffre.",
  "required": "Ce champ est requis.",
  "invalid_email": "Adresse email invalide.",
  "otp_format": "Le code doit contenir 6 chiffres.",
  "invalid_enum": "Valeur invalide pour ce champ."
}
```

### `i18n/en/validation.json`
```json
{
  "phone_format": "Required format: +237 6XXXXXXXX or +237 9XXXXXXXX",
  "password_strength": "Minimum 8 characters with at least one uppercase, one lowercase, and one number.",
  "required": "This field is required.",
  "invalid_email": "Invalid email address.",
  "otp_format": "Code must be 6 digits.",
  "invalid_enum": "Invalid value for this field."
}
```

---

## 8. Using i18n in Services

```typescript
// apps/api/src/modules/auth/auth.service.ts
import { I18nService, I18nContext } from 'nestjs-i18n'

@Injectable()
export class AuthService {
  constructor(
    // ... other injections
    private i18n: I18nService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthStepResponse> {
    const phoneExists = await this.usersRepo.existsBy({ phone: dto.phone })
    if (phoneExists) {
      throw new ConflictException({
        code: 'PHONE_EXISTS',
        nextStep: 'LOGIN',
        message: await this.i18n.translate('auth.register.phone_exists'),
        // ↑ locale auto-resolved from request context
      })
    }

    // ... create user ...

    return {
      nextStep: 'VERIFY_PHONE',
      message: await this.i18n.translate('auth.register.success', {
        args: { phone: this.maskPhone(dto.phone) },
      }),
      context: { ... },
    }
  }

  private async validateOTP(userId: string, type: OTPType, code: string) {
    // ...
    if (!otp) {
      throw new BadRequestException({
        code: 'OTP_EXPIRED',
        message: await this.i18n.translate('auth.otp.expired'),
        nextStep: 'REQUEST_NEW_OTP',
      })
    }

    if (otp.attempts + 1 >= 5) {
      throw new TooManyRequestsException({
        code: 'OTP_MAX_ATTEMPTS',
        message: await this.i18n.translate('auth.otp.max_attempts'),
        nextStep: 'REQUEST_NEW_OTP',
      })
    }

    if (submittedHash !== otp.codeHash) {
      const attemptsLeft = 5 - (otp.attempts + 1)
      throw new BadRequestException({
        code: 'INVALID_OTP',
        message: await this.i18n.translate('auth.otp.invalid'),
        context: {
          attemptsLeft,
          hint: await this.i18n.translate('auth.otp.attempts_left', {
            args: { count: attemptsLeft },
          }),
        },
      })
    }
  }
}
```

---

## 9. Notification Service — Locale-Aware

Notifications (SMS, WhatsApp, Email) need the user's locale explicitly since they run outside the HTTP request context (schedulers, background jobs).

```typescript
// apps/api/src/modules/notifications/notifications.service.ts
import { I18nService } from 'nestjs-i18n'

@Injectable()
export class NotificationsService {
  constructor(private i18n: I18nService) {}

  async sendOTP(params: {
    destination: string
    code: string
    channel: OTPChannel
    locale: Locale               // ← explicit locale — no request context available
  }): Promise<void> {
    const lang = params.locale

    if (params.channel === OTPChannel.SMS) {
      const message = await this.i18n.translate('notifications.otp_sms', {
        lang,
        args: { code: params.code },
      })
      await this.smsProvider.send(params.destination, message)
    }

    if (params.channel === OTPChannel.WHATSAPP) {
      const message = await this.i18n.translate('notifications.otp_whatsapp', {
        lang,
        args: { code: params.code },
      })
      await this.whatsappProvider.send(params.destination, message)
    }

    if (params.channel === OTPChannel.EMAIL) {
      const subject = await this.i18n.translate('notifications.otp_email_subject', { lang })
      const body = await this.i18n.translate('notifications.otp_whatsapp', {
        lang,
        args: { code: params.code },
      })
      await this.emailProvider.send(params.destination, subject, body)
    }
  }

  async sendTrialEndingSoon(business: Business & { user: User }): Promise<void> {
    const lang = business.user.locale
    const daysLeft = Math.ceil(
      (business.trialEndsAt.getTime() - Date.now()) / 86400000
    )
    const message = await this.i18n.translate('notifications.trial_ending_soon', {
      lang,
      args: { name: business.user.name, days: daysLeft },
    })
    await this.smsProvider.send(business.user.phone, message)
  }

  async sendWelcome(user: User): Promise<void> {
    const message = await this.i18n.translate('notifications.welcome', {
      lang: user.locale,
      args: {
        name: user.name,
        support_number: process.env.SUPPORT_WHATSAPP_NUMBER,
      },
    })
    await this.smsProvider.send(user.phone, message)
  }
}
```

---

## 10. Global Exception Filter — Localised Error Responses

This ensures ALL unhandled exceptions return localised messages, not raw NestJS defaults.

```typescript
// apps/api/src/common/filters/i18n-exception.filter.ts
import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common'
import { I18nService, I18nContext } from 'nestjs-i18n'
import { Response } from 'express'

@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  private logger = new Logger(I18nExceptionFilter.name)

  constructor(private i18n: I18nService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const res = ctx.getResponse<Response>()
    const req = ctx.getRequest()

    const i18nCtx = I18nContext.current(host)
    const lang = i18nCtx?.lang ?? 'fr'

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const exceptionResponse = exception.getResponse() as any

      // If the service already provided a localised message, use it
      // Otherwise translate a generic message based on status
      const message = exceptionResponse.message
        ?? await this.translateStatus(status, lang)

      return res.status(status).json({
        success: false,
        statusCode: status,
        code: exceptionResponse.code ?? 'ERROR',
        message,
        nextStep: exceptionResponse.nextStep ?? null,
        context: exceptionResponse.context ?? null,
        timestamp: new Date().toISOString(),
        path: req.url,
      })
    }

    // Unhandled error — never leak internals
    this.logger.error('Unhandled exception', exception)

    const message = await this.i18n.translate('errors.server_error', { lang })
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      success: false,
      statusCode: 500,
      code: 'SERVER_ERROR',
      message,
      timestamp: new Date().toISOString(),
      path: req.url,
    })
  }

  private async translateStatus(status: number, lang: string): Promise<string> {
    const statusMap: Record<number, string> = {
      400: 'errors.validation_failed',
      401: 'errors.unauthorized',
      403: 'errors.forbidden',
      404: 'errors.not_found',
      429: 'errors.rate_limited',
      500: 'errors.server_error',
    }
    const key = statusMap[status] ?? 'errors.server_error'
    return this.i18n.translate(key, { lang })
  }
}
```

**Register globally in main.ts:**
```typescript
// apps/api/src/main.ts
import { I18nService } from 'nestjs-i18n'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  const i18n = app.get(I18nService)
  app.useGlobalFilters(new I18nExceptionFilter(i18n))

  await app.listen(3000)
}
```

---

## 11. Localised Validation Messages

Using nestjs-i18n with class-validator so DTO validation errors are also translated:

```typescript
// apps/api/src/common/pipes/i18n-validation.pipe.ts
import { ValidationPipe } from '@nestjs/common'
import { I18nService, I18nContext } from 'nestjs-i18n'

export function createI18nValidationPipe(i18n: I18nService): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) => {
      const lang = I18nContext.current()?.lang ?? 'fr'
      const messages = errors.map(err => ({
        field: err.property,
        errors: Object.values(err.constraints ?? {}),
      }))
      return new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: i18n.translate('errors.validation_failed', { lang }),
        context: { fields: messages },
      })
    },
  })
}

// Register in main.ts
const i18n = app.get(I18nService)
app.useGlobalPipes(createI18nValidationPipe(i18n))
```

---

## 12. Update RegisterDto — Accept Locale

```typescript
// apps/api/src/modules/auth/dto/register.dto.ts
import { Locale } from '../../../common/enums/locale.enum'

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(60)
  name: string

  @IsString() @Matches(/^\+237[6-9][0-9]{8}$/)
  phone: string

  @IsString() @MinLength(8)
  password: string

  @IsOptional() @IsEmail()
  email?: string

  @IsOptional() @IsEnum(Locale)
  locale?: Locale                      // user picks language on registration screen

  @IsOptional() @IsEnum(OTPChannel)
  preferredOtpChannel?: OTPChannel
}
```

---

## 13. Update Locale Mid-Session

Users can change their language in Settings. This endpoint updates their saved locale and all subsequent responses will use the new language.

```typescript
// PATCH /users/me/locale
async updateLocale(userId: string, locale: Locale): Promise<void> {
  await this.usersRepo.update(userId, { locale })
  // No cache to invalidate — locale is read fresh per request
}
```

---

## 14. Type Safety — Generated Types

`nestjs-i18n` can generate TypeScript types from your JSON files so you get autocomplete on translation keys:

```typescript
// After running: pnpm nest build
// Generated: src/generated/i18n.generated.ts

// Usage with full type safety:
await this.i18n.translate('auth.otp.invalid')
//                         ↑ TypeScript will error if this key doesn't exist
```

Add to `nest-cli.json`:
```json
{
  "generateOptions": {
    "watchAssets": true
  }
}
```

---

## 15. Summary of Locale Sources Per Context

| Context | Locale Source |
|---------|--------------|
| Authenticated HTTP request | User's saved `locale` in DB |
| Unauthenticated HTTP request (register, login) | `locale` in request body → `Accept-Language` header → default `fr` |
| Background job / scheduler | Explicitly passed from user/business record |
| SMS / WhatsApp notification | `user.locale` from DB |
| Email notification | `user.locale` from DB |
| Validation errors | Current request context lang |
| Unhandled exceptions | Current request context lang → default `fr` |
