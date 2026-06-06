import { Controller, UseGuards } from '@nestjs/common'
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger'
import { Phase2Guard } from '@/modules/auth/guards/phase2.guard'
import { DepositsService } from '../services/savings.service'

@ApiTags('Deposits')
@ApiBearerAuth()
@Controller('deposits')
@UseGuards(Phase2Guard)
export class SavingsController {
  constructor(private readonly depositsService: DepositsService) {}
}
