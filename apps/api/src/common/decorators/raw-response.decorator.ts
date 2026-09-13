import { SetMetadata } from '@nestjs/common'

/** Metadata key marking a handler whose return value must NOT be wrapped in the success envelope. */
export const RAW_RESPONSE_KEY = 'raw_response'

/**
 * Spec 07 §8 — opt a handler out of the global success envelope. Payment providers often require an
 * exact literal acknowledgement body on their webhook; a `@RawResponse()` handler's return value is
 * sent verbatim. (Errors still go through HttpExceptionFilter.)
 */
export const RawResponse = (): MethodDecorator => SetMetadata(RAW_RESPONSE_KEY, true)
