import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { SimilarityService } from '../similarity/similarity.service';

@Controller('worker/similarity')
export class WorkerSimilarityController {
  constructor(private readonly similarityService: SimilarityService) {}

  @Get('assets')
  async listAssets(
    @Headers('x-imagehub-token') headerToken?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('mediaType') mediaType?: string,
    @Query('assetIds') assetIds?: string,
  ) {
    this.assertWorkerToken(headerToken);
    const result = await this.similarityService.listWorkerAssets({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      status,
      mediaType,
      assetIds: assetIds ? assetIds.split(',').map((value) => value.trim()).filter(Boolean) : undefined,
    });

    return { success: true, ...result };
  }

  @Post('fingerprints/bulk')
  async bulkUpdateFingerprints(
    @Body()
    body: {
      fingerprints: Array<{
        assetId: string;
        sha256?: string | null;
        phash?: string | null;
        dhash?: string | null;
        width?: number | null;
        height?: number | null;
        qualityScore?: number | null;
      }>;
    },
    @Headers('x-imagehub-token') headerToken?: string,
  ) {
    this.assertWorkerToken(headerToken);
    const result = await this.similarityService.bulkUpdateFingerprints(body.fingerprints || []);
    return { success: true, data: result };
  }

  @Post('candidates/bulk')
  async bulkUpsertCandidates(
    @Body()
    body: {
      candidates: Array<{
        assetAId: string;
        assetBId: string;
        sha256Equal: boolean;
        phashDistance: number | null;
        dhashDistance: number | null;
        ssimScore?: number | null;
        diffAreaRatio?: number | null;
        similarityType: string;
        qualityWinnerAssetId: string | null;
      }>;
    },
    @Headers('x-imagehub-token') headerToken?: string,
  ) {
    this.assertWorkerToken(headerToken);
    const result = await this.similarityService.bulkUpsertCandidates(body.candidates || []);
    return { success: true, data: result };
  }

  private assertWorkerToken(headerToken?: string) {
    const token = process.env.WORKER_TOKEN || process.env.ADMIN_TOKEN || process.env.INTERNAL_API_TOKEN;
    if (!token) {
      return;
    }

    if (!headerToken || headerToken.trim() !== token) {
      throw new UnauthorizedException('Invalid worker token');
    }
  }
}
