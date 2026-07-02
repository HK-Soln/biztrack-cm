import { Injectable } from '@nestjs/common'
import { RealtimeAuthService } from '../services/realtime-auth.service'
import { parseChannel, type ParsedChannel, type Principal } from '../realtime.types'

/** A pluggable authorizer for a channel kind. Returns true if the principal may join. */
export type ChannelAuthorizer = (
  principal: Principal,
  channel: Extract<ParsedChannel, { type: string }>,
) => boolean | Promise<boolean>

/**
 * Decides whether a principal may subscribe to a channel. Built-in rules cover the
 * core channel kinds; modules can register more via `register()`. The gateway is
 * generic and consults this for EVERY subscribe — it can't forget a check.
 */
@Injectable()
export class ChannelRegistry {
  private readonly extra = new Map<string, ChannelAuthorizer>()

  constructor(private readonly auth: RealtimeAuthService) {}

  /** Register a custom channel-kind authorizer (e.g. an OTC `request` channel). */
  register(kind: string, authorizer: ChannelAuthorizer): void {
    this.extra.set(kind, authorizer)
  }

  async authorize(principal: Principal, raw: string): Promise<boolean> {
    const channel = parseChannel(raw)
    switch (channel.type) {
      case 'user':
        return channel.userId === principal.userId
      case 'device':
        return !!principal.deviceId && channel.deviceId === principal.deviceId
      case 'business':
        // Membership is the gate; topic-level permission checks can be layered later.
        return this.auth.hasActiveMembership(channel.businessId, principal.userId)
      default: {
        const custom = this.extra.get(channel.type)
        return custom ? custom(principal, channel) : false
      }
    }
  }
}
