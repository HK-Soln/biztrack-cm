import { ApiProperty } from '@nestjs/swagger'
import { Matches } from 'class-validator'
import type { SetMemberPinRequest } from '@biztrack/types'

/** A bcrypt hash: `$2a$`/`$2b$`/`$2y$`, a two-digit cost, then 53 base64-ish chars.
 * The server stores this verbatim and never verifies it, so we at least insist it
 * is a well-formed bcrypt hash and not an arbitrary string or a plaintext PIN. */
const BCRYPT_HASH = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/

export class SetMemberPinDto implements SetMemberPinRequest {
  @ApiProperty({ description: 'bcrypt hash of the PIN, computed on the device.' })
  @Matches(BCRYPT_HASH, { message: 'pinHash must be a bcrypt hash' })
  pinHash!: string
}
