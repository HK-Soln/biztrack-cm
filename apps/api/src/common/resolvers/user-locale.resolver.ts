import { Injectable, ExecutionContext } from '@nestjs/common'
import { I18nResolver } from 'nestjs-i18n'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { User } from '@/entities/user.entity'
import { DEFAULT_LOCALE, SUPPORTED_LOCALES } from '@/common/enums/locale.enum'

@Injectable()
export class UserLocaleResolver implements I18nResolver {
  constructor(
    @InjectRepository(User)
    private usersRepo: Repository<User>,
  ) { }

  async resolve(context: ExecutionContext): Promise<string> {
    const req = context.switchToHttp().getRequest()

    if (req?.user?.sub) {
      const user = await this.usersRepo.findOne({
        where: { id: req.user.sub },
        select: ['language'],
      })
      if (user?.language && SUPPORTED_LOCALES.includes(user.language as any)) {
        return user.language
      }
    }

    const queryLocale = req?.query?.locale ?? req?.query?.language
    if (queryLocale && SUPPORTED_LOCALES.includes(queryLocale)) {
      return queryLocale
    }

    const bodyLocale = req?.body?.locale ?? req?.body?.language
    if (bodyLocale && SUPPORTED_LOCALES.includes(bodyLocale)) {
      return bodyLocale
    }

    const acceptLang = req?.headers?.['accept-language']
    if (acceptLang) {
      const preferred = String(acceptLang).split(',')[0]?.split('-')[0]?.toLowerCase()
      if (SUPPORTED_LOCALES.includes(preferred as any)) return preferred || DEFAULT_LOCALE
    }

    return DEFAULT_LOCALE
  }
}
