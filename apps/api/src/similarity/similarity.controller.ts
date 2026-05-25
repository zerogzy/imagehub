import {
  Controller,
  Get,
  Post,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { SimilarityService } from './similarity.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller('admin/similarity')
@UseGuards(TokenGuard, AdminGuard)
export class SimilarityController {
  constructor(private similarityService: SimilarityService) {}

  @Get('candidates')
  async getCandidates(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
  ) {
    const result = await this.similarityService.getCandidates({
      status,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
    return { success: true, ...result };
  }

  @Post('scan')
  async triggerScan(@Body() body: Record<string, any> = {}) {
    const job = await this.similarityService.triggerScan();
    return {
      success: true,
      data: {
        jobId: job.id,
        status: job.status,
        progress: job.progress,
        result: job.resultJson ? JSON.parse(job.resultJson) : null,
        errorMessage: job.errorMessage,
      },
    };
  }

  @Post('resolve')
  async resolveCandidate(
    @Body() body: { candidateId: string; status: string; qualityWinnerAssetId?: string },
  ) {
    const candidate = await this.similarityService.resolveCandidate(
      body.candidateId,
      body,
    );
    return { success: true, data: candidate };
  }
}
