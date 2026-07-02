import { Global, Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { JwtModule } from '@nestjs/jwt'
import { BusinessMember } from '@/entities/business-member.entity'
import { RedisModule } from '@/common/redis/redis.module'
import { RealtimeAuthService } from './services/realtime-auth.service'
import { RealtimeService } from './services/realtime.service'
import { ChannelRegistry } from './channels/channel-registry'
import { RealtimeGateway } from './gateway/realtime.gateway'

/**
 * App-wide realtime layer (Socket.IO + Redis adapter). Any module injects
 * `RealtimeService` to publish typed events; the gateway authenticates with the access
 * token only. @Global so consumers don't import this module explicitly.
 */
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([BusinessMember]), JwtModule.register({}), RedisModule],
  providers: [RealtimeAuthService, RealtimeService, ChannelRegistry, RealtimeGateway],
  exports: [RealtimeService, ChannelRegistry],
})
export class RealtimeModule {}
