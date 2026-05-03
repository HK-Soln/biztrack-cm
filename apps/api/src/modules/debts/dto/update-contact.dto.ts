import { PartialType } from '@nestjs/swagger'
import type { UpdateContactRequest } from '@biztrack/types'
import { CreateContactDto } from './create-contact.dto'

export class UpdateContactDto extends PartialType(CreateContactDto) implements UpdateContactRequest {}
