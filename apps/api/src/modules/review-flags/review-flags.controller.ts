import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { JwtPayload } from '@biztrack/types'
import { CurrentUser } from '@/common/decorators/current-user.decorator'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { QueryReviewFlagsDto, ResolveReviewFlagDto } from './dto/query-review-flags.dto'
import { ReviewFlagsService } from './review-flags.service'

@ApiTags('Review flags')
@ApiBearerAuth()
@UseGuards(Phase2Guard)
@Controller('review-flags')
export class ReviewFlagsController {
  constructor(private readonly reviewFlags: ReviewFlagsService) {}

  @Get()
  @ApiOperation({ summary: 'List review flags, most serious first' })
  async list(@CurrentUser() user: JwtPayload, @Query() query: QueryReviewFlagsDto) {
    await this.reviewFlags.assertCanReview(user.businessId as string, user.sub)
    return this.reviewFlags.list(user.businessId as string, query)
  }

  @Get('count')
  @ApiOperation({ summary: 'Open review flags, and how many are high severity' })
  async count(@CurrentUser() user: JwtPayload) {
    await this.reviewFlags.assertCanReview(user.businessId as string, user.sub)
    return this.reviewFlags.countOpen(user.businessId as string)
  }

  @Post(':id/resolve')
  @ApiOperation({ summary: 'Mark a review flag as resolved' })
  async resolve(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ResolveReviewFlagDto,
  ) {
    await this.reviewFlags.assertCanReview(user.businessId as string, user.sub)
    return this.reviewFlags.resolve(user.businessId as string, id, user.sub, body.note)
  }
}
