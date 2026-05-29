import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class DownloadService {
  private readonly tempExpireMinutes: number;
  private readonly batchMaxExpireMinutes: number;

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private configService: ConfigService,
  ) {
    this.tempExpireMinutes = this.configService.get<number>('DOWNLOAD_TEMP_EXPIRE_MINUTES', 5);
    this.batchMaxExpireMinutes = this.configService.get<number>('DOWNLOAD_BATCH_MAX_EXPIRE_MINUTES', 30);
  }

  /**
   * Generate a short-lived download token for a single asset.
   */
  async createTempDownloadToken(params: {
    assetId: string;
    tokenId: string;
  }): Promise<{ downloadUrl: string; expiresAt: Date }> {
    const rawToken = crypto.randomBytes(24).toString('hex');
    const tokenHash = await bcrypt.hash(rawToken, 10);
    const expiresAt = new Date(Date.now() + this.tempExpireMinutes * 60 * 1000);

    await this.prisma.downloadToken.create({
      data: {
        assetId: params.assetId,
        tokenHash,
        downloadType: 'temp_single',
        expiresAt,
        createdByTokenId: params.tokenId,
      },
    });

    const downloadUrl = `/api/v1/download/temp/${rawToken}`;

    return { downloadUrl, expiresAt };
  }

  /**
   * Validate and consume a temp download token.
   * Returns the asset ID if valid, null otherwise.
   */
  async validateTempToken(rawToken: string): Promise<{ assetId: string; createdByTokenId: string } | null> {
    // We can't look up by hash directly, so we need to check all active tokens
    // In production, consider using a Redis cache for active tokens
    const activeTokens = await this.prisma.downloadToken.findMany({
      where: {
        downloadType: 'temp_single',
        expiresAt: { gt: new Date() },
        usedAt: null,
      },
    });

    for (const token of activeTokens) {
      const isValid = await bcrypt.compare(rawToken, token.tokenHash);
      if (isValid) {
        // Mark as used
        await this.prisma.downloadToken.update({
          where: { id: token.id },
          data: { usedAt: new Date() },
        });
        return { assetId: token.assetId, createdByTokenId: token.createdByTokenId };
      }
    }

    return null;
  }

  /**
   * Create a permanent download share link.
   */
  async createPermanentShare(params: {
    assetId: string;
    tokenId: string;
  }) {
    const shareId = crypto.randomBytes(8).toString('hex');

    return this.prisma.downloadShare.create({
      data: {
        assetId: params.assetId,
        shareId,
        createdByTokenId: params.tokenId,
        enabled: true,
        permanent: true,
      },
    });
  }

  /**
   * Get a permanent share by share ID.
   */
  async getPermanentShare(shareId: string) {
    return this.prisma.downloadShare.findUnique({
      where: { shareId },
      include: { asset: true },
    });
  }

  /**
   * Increment download count and update last accessed.
   */
  async recordShareAccess(shareId: string) {
    return this.prisma.downloadShare.update({
      where: { shareId },
      data: {
        downloadCount: { increment: 1 },
        lastAccessedAt: new Date(),
      },
    });
  }

  async listPermanentShares() {
    return this.prisma.downloadShare.findMany({
      where: { permanent: true, enabled: true },
      orderBy: { createdAt: 'desc' },
      include: {
        asset: {
          select: {
            id: true,
            originalFilename: true,
            displayFilename: true,
            mediaType: true,
            mimeType: true,
            status: true,
            sizeBytes: true,
            derivatives: {
              where: { derivativeType: 'thumb' },
              take: 1,
              select: { storageKey: true },
            },
          },
        },
      },
    });
  }

  /**
   * Revoke a permanent share.
   */
  async revokeShare(shareId: string) {
    return this.prisma.downloadShare.update({
      where: { shareId },
      data: { enabled: false, revokedAt: new Date() },
    });
  }

  /**
   * Get the storage key for an asset.
   */
  async getAssetStorageKey(assetId: string): Promise<string | null> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: { storageKey: true, status: true },
    });
    if (!asset || asset.status === 'trashed') return null;
    return asset.storageKey;
  }

  /**
   * 拉下载所需的完整 asset 信息: storageKey + 原始文件名 + mime, 用于设置下载头。
   */
  async getDownloadableAsset(assetId: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      select: {
        storageKey: true,
        status: true,
        originalFilename: true,
        displayFilename: true,
        mimeType: true,
      },
    });
    if (!asset || asset.status === 'trashed') return null;
    return asset;
  }

  /**
   * Create a batch download job.
   */
  async createBatchDownload(params: {
    assetIds: string[];
    tokenId: string;
  }) {
    return this.prisma.batchJob.create({
      data: {
        jobType: 'batch_download_zip',
        status: 'pending',
        payloadJson: JSON.stringify({ assetIds: params.assetIds }),
        progress: 0,
        createdByTokenId: params.tokenId,
      },
    });
  }

  /**
   * Get a readable stream for an asset by storage key.
   */
  getAssetStream(storageKey: string): NodeJS.ReadableStream {
    return this.storageService.getStream(storageKey);
  }

  /**
   * Get file stats for an asset.
   */
  async getAssetStats(storageKey: string) {
    return this.storageService.getStats(storageKey);
  }
}
