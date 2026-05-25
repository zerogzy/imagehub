import {
  Controller,
  Get,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Body,
  Request,
  Post,
} from '@nestjs/common';
import { AssetService } from './asset.service';
import { StatsService } from '../stats/stats.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';
import { FastifyRequest } from 'fastify';
import * as crypto from 'crypto';

@Controller()
export class AssetController {
  constructor(
    private assetService: AssetService,
    private statsService: StatsService,
  ) {}

  /**
   * Gallery endpoint - accessible by any valid token.
   */
  @Get('gallery')
  @UseGuards(TokenGuard)
  async getGallery(
    @Query('groupId') groupId?: string,
    @Query('subgroupId') subgroupId?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('seed') seed?: string,
    @Query('sortMode') sortMode?: string,
    @Query('mediaType') mediaType?: string,
    @Query('tag') tag?: string,
  ) {
    const result = await this.assetService.getGallery({
      groupId,
      subgroupId,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      seed,
      sortMode,
      mediaType,
      tag,
    });
    return { success: true, ...result };
  }

  /**
   * Get asset detail - accessible by any valid token.
   */
  @Get('assets/:id')
  @UseGuards(TokenGuard)
  async getAsset(@Param('id') id: string, @Request() req: FastifyRequest) {
    const token = (req as any).token;
    const includeAdmin = token.role === 'admin';
    const asset = await this.assetService.getAssetById(id, includeAdmin);

    if (!asset) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Asset not found' } };
    }

    this.recordAccessEvent(asset.id, token.id, req);

    return { success: true, data: asset };
  }

  private recordAccessEvent(assetId: string, tokenId: string | undefined, req: FastifyRequest) {
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip;
    const userAgent = req.headers['user-agent'];
    const referer = req.headers.referer;
    this.statsService.recordEvent({
      assetId,
      eventType: 'api_detail',
      tokenId,
      ipHash: ip ? this.hashValue(ip) : undefined,
      userAgentHash: userAgent ? this.hashValue(String(userAgent)) : undefined,
      referer: referer ? String(referer) : undefined,
    }).catch(() => undefined);
  }

  private hashValue(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Admin: List all assets (including non-ready).
   */
  @Get('admin/assets')
  @UseGuards(TokenGuard, AdminGuard)
  async listAdminAssets(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('mediaType') mediaType?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('groupId') groupId?: string,
    @Query('subgroupId') subgroupId?: string,
  ) {
    const result = await this.assetService.listAdminAssets({
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      mediaType,
      status,
      search,
      groupId,
      subgroupId,
    });
    return { success: true, ...result };
  }

  /**
   * Admin: Update asset.
   */
  @Patch('admin/assets/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async updateAsset(
    @Param('id') id: string,
    @Body() body: { displayFilename?: string },
  ) {
    const asset = await this.assetService.updateAsset(id, body);
    return { success: true, data: asset };
  }

  /**
   * Admin: Soft-delete asset (move to trash).
   */
  @Delete('admin/assets/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async deleteAsset(
    @Param('id') id: string,
    @Request() req: FastifyRequest,
    @Body() body?: { reason?: string },
  ) {
    const tokenId = (req as any).token.id;
    const result = await this.assetService.softDeleteAsset(id, tokenId, body?.reason);
    if (!result) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Asset not found' } };
    }
    return result;
  }

  /**
   * Admin: Batch soft-delete assets.
   */
  @Post('admin/assets/batch/delete')
  @UseGuards(TokenGuard, AdminGuard)
  async batchDeleteAssets(
    @Body() body: { assetIds: string[]; reason?: string },
    @Request() req: FastifyRequest,
  ) {
    const tokenId = (req as any).token.id;
    const results = await this.assetService.batchSoftDelete(
      body.assetIds,
      tokenId,
      body.reason,
    );
    return { success: true, data: results };
  }
}
