import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { StatsService } from './stats.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin/stats')
@UseGuards(TokenGuard, AdminGuard)
export class StatsController {
  constructor(private statsService: StatsService) {}

  @Get('overview')
  async getOverview() {
    const overview = await this.statsService.getOverview();
    return { success: true, data: overview };
  }

  @Get('asset')
  async getAssetSummary(@Query('assetId') assetId: string) {
    const summary = await this.statsService.getAssetSummary(assetId);
    return { success: true, data: summary };
  }

  @Post('clear')
  async clearAccessStats() {
    const result = await this.statsService.clearAccessStats();
    return { success: true, data: result };
  }

  @Get('assets')
  async getAssetStats(
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 10;

    if (type === 'downloads') {
      const topDownloaded = await this.statsService.getTopDownloaded(limitNum);
      return { success: true, data: topDownloaded };
    }

    // Default: views
    const topViewed = await this.statsService.getTopViewed(limitNum);
    return { success: true, data: topViewed };
  }

  @Get('tokens')
  async getTokenStats() {
    return { success: true, data: {} };
  }

  @Get('shares')
  async getShareStats() {
    return { success: true, data: {} };
  }
}
