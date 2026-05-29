import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  UseGuards,
  Res,
} from '@nestjs/common';
import { DownloadService } from './download.service';
import { StatsService } from '../stats/stats.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';
import { FastifyRequest, FastifyReply } from 'fastify';
import { Request } from '@nestjs/common';
import * as crypto from 'crypto';
import { buildContentDisposition } from './content-disposition.helper';

@Controller()
export class DownloadController {
  constructor(
    private downloadService: DownloadService,
    private statsService: StatsService,
  ) {}

  /**
   * Generate a short-lived download token.
   */
  @Post('download/token')
  @UseGuards(TokenGuard)
  async createDownloadToken(
    @Body() body: { assetId: string },
    @Request() req: FastifyRequest,
  ) {
    const tokenId = (req as any).token.id;
    const result = await this.downloadService.createTempDownloadToken({
      assetId: body.assetId,
      tokenId,
    });
    return { success: true, data: result };
  }

  /**
   * Download using a temp token.
   */
  @Get('download/temp/:token')
  async downloadTemp(
    @Param('token') token: string,
    @Res() res: FastifyReply,
    @Request() req: FastifyRequest,
  ) {
    const downloadToken = await this.downloadService.validateTempToken(token);
    if (!downloadToken) {
      res.code(403).send({ success: false, error: { code: 'INVALID_TOKEN', message: 'Invalid or expired download token' } });
      return;
    }

    const asset = await this.downloadService.getDownloadableAsset(downloadToken.assetId);
    if (!asset) {
      res.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'File not found' } });
      return;
    }

    this.recordAccessEvent({
      assetId: downloadToken.assetId,
      eventType: 'download',
      tokenId: downloadToken.createdByTokenId,
      req,
    });

    const stream = this.downloadService.getAssetStream(asset.storageKey);
    const stats = await this.downloadService.getAssetStats(asset.storageKey);

    const filename = asset.displayFilename || asset.originalFilename;
    res.header('Content-Disposition', buildContentDisposition(filename));
    res.header('Content-Type', asset.mimeType || 'application/octet-stream');
    res.header('Content-Length', stats.size.toString());
    res.send(stream);
  }

  /**
   * Download using a permanent share link.
   */
  @Get('share/download/:shareId')
  async downloadShare(
    @Param('shareId') shareId: string,
    @Res() res: FastifyReply,
    @Request() req: FastifyRequest,
  ) {
    const share = await this.downloadService.getPermanentShare(shareId);
    if (!share || !share.enabled || share.asset.status === 'trashed') {
      res.code(404).send({ success: false, error: { code: 'NOT_FOUND', message: 'Share link not found or revoked' } });
      return;
    }

    await this.downloadService.recordShareAccess(shareId);
    this.recordAccessEvent({
      assetId: share.assetId,
      eventType: 'permanent_share_download',
      shareId,
      req,
    });

    const storageKey = share.asset.storageKey;
    const stream = this.downloadService.getAssetStream(storageKey);
    const stats = await this.downloadService.getAssetStats(storageKey);

    const filename = share.asset.displayFilename || share.asset.originalFilename;
    res.header('Content-Disposition', buildContentDisposition(filename));
    res.header('Content-Type', share.asset.mimeType || 'application/octet-stream');
    res.header('Content-Length', stats.size.toString());
    res.send(stream);
  }

  /**
   * Admin: Create a permanent share link.
   */
  @Post('admin/shares/permanent')
  @UseGuards(TokenGuard, AdminGuard)
  async createPermanentShare(
    @Body() body: { assetId: string },
    @Request() req: FastifyRequest,
  ) {
    const tokenId = (req as any).token.id;
    const share = await this.downloadService.createPermanentShare({
      assetId: body.assetId,
      tokenId,
    });
    return { success: true, data: share };
  }

  @Get('admin/shares/permanent')
  @UseGuards(TokenGuard, AdminGuard)
  async listPermanentShares() {
    const shares = await this.downloadService.listPermanentShares();
    return {
      success: true,
      data: {
        shares: shares.map((share: any) => ({
          id: share.id,
          shareId: share.shareId,
          enabled: share.enabled,
          permanent: share.permanent,
          downloadCount: share.downloadCount,
          lastAccessedAt: share.lastAccessedAt,
          createdAt: share.createdAt,
          downloadUrl: `/api/v1/share/download/${share.shareId}`,
          asset: {
            ...share.asset,
            sizeBytes: share.asset.sizeBytes.toString(),
            thumbStorageKey: share.asset.derivatives[0]?.storageKey || null,
          },
        })),
      },
    };
  }

  /**
   * Admin: Revoke a permanent share link.
   */
  @Delete('admin/shares/permanent/:shareId')
  @UseGuards(TokenGuard, AdminGuard)
  async revokePermanentShare(@Param('shareId') shareId: string) {
    await this.downloadService.revokeShare(shareId);
    return { success: true };
  }

  private recordAccessEvent(params: {
    assetId: string;
    eventType: string;
    req: FastifyRequest;
    tokenId?: string;
    shareId?: string;
  }) {
    const ip = (params.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || params.req.ip;
    const userAgent = params.req.headers['user-agent'];
    const referer = params.req.headers.referer;
    this.statsService.recordEvent({
      assetId: params.assetId,
      eventType: params.eventType,
      tokenId: params.tokenId,
      shareId: params.shareId,
      ipHash: ip ? this.hashValue(ip) : undefined,
      userAgentHash: userAgent ? this.hashValue(String(userAgent)) : undefined,
      referer: referer ? String(referer) : undefined,
    }).catch(() => undefined);
  }

  private hashValue(value: string) {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Batch download.
   */
  @Post('download/batch')
  @UseGuards(TokenGuard)
  async batchDownload(
    @Body() body: { assetIds: string[] },
    @Request() req: FastifyRequest,
  ) {
    const tokenId = (req as any).token.id;
    const job = await this.downloadService.createBatchDownload({
      assetIds: body.assetIds,
      tokenId,
    });
    return { success: true, data: { jobId: job.id, status: job.status } };
  }
}
