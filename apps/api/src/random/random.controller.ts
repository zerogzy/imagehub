import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { RandomService } from './random.service';
import { TokenGuard } from '../auth/token.guard';

@Controller('random')
@UseGuards(TokenGuard)
export class RandomController {
  constructor(private randomService: RandomService) {}

  @Get('seed')
  async getSeed(@Query('groupId') groupId: string, @Query('seed') seed?: string) {
    const currentSeed = await this.randomService.getGroupSeed(groupId, seed);
    return { success: true, data: { seed: currentSeed } };
  }
}
