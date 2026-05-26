import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { DerivativeService } from '../derivative/derivative.service';
import { SearchService } from '../search/search.service';
import { GroupService } from '../group/group.service';
import { getMediaTypeFromMime, AssetStatus } from '@imagehub/shared';
import * as crypto from 'crypto';
import * as path from 'path';

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
    private derivativeService: DerivativeService,
    private searchService: SearchService,
    private groupService: GroupService,
  ) {}

  async processUploadedFile(params: {
    file: {
      fieldname: string;
      originalname: string;
      encoding: string;
      mimetype: string;
      buffer: Buffer;
      size: number;
    };
    groupId?: string;
    subgroupId?: string;
    tokenId: string;
  }) {
    const { file } = params;
    const target = await this.resolveUploadTarget(params.groupId, params.subgroupId);
    const assetId = crypto.randomUUID();

    const mediaType = getMediaTypeFromMime(file.mimetype);
    if (!mediaType) {
      throw new Error(`Unsupported MIME type: ${file.mimetype}`);
    }

    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const existingAsset = await this.prisma.mediaAsset.findUnique({
      where: { sha256 },
      include: { trashItem: true },
    });

    if (existingAsset) {
      if (existingAsset.status === AssetStatus.TRASHED) {
        await this.prisma.mediaAsset.update({
          where: { id: existingAsset.id },
          data: {
            status: existingAsset.trashItem?.originalStatus || AssetStatus.READY,
            deletedAt: null,
          },
        });
        await this.prisma.trashItem.deleteMany({
          where: { assetId: existingAsset.id },
        });
      }

      if (target.groupId) {
        await this.prisma.groupAsset.upsert({
          where: { groupId_assetId: { groupId: target.groupId, assetId: existingAsset.id } },
          create: {
            groupId: target.groupId,
            subgroupId: target.subgroupId,
            assetId: existingAsset.id,
            rankKey: Date.now().toString(36),
          },
          update: {
            subgroupId: target.subgroupId,
          },
        });
      }

      // 索引已有的 asset
      this.searchService.reindexAsset(existingAsset.id).catch(() => {});

      return {
        id: existingAsset.id,
        originalFilename: existingAsset.originalFilename,
        mediaType: existingAsset.mediaType,
        status:
          existingAsset.status === AssetStatus.TRASHED
            ? existingAsset.trashItem?.originalStatus || AssetStatus.READY
            : existingAsset.status,
        duplicate: true,
      };
    }

    const ext = path.extname(file.originalname).substring(1) || this.extFromMime(file.mimetype);
    const storageKey = this.storageService.generateStorageKey({
      type: 'original',
      assetId,
      suffix: 'original',
      extension: ext,
    });

    await this.storageService.save(storageKey, file.buffer);

    const asset = await this.prisma.mediaAsset.create({
      data: {
        id: assetId,
        originalFilename: file.originalname,
        displayFilename: file.originalname,
        storageKey,
        mimeType: file.mimetype,
        mediaType,
        sizeBytes: BigInt(file.size),
        sha256,
        status: AssetStatus.PROCESSING,
      },
    });

    if (target.groupId) {
      await this.prisma.groupAsset.create({
        data: {
          groupId: target.groupId,
          subgroupId: target.subgroupId,
          assetId,
          rankKey: Date.now().toString(36),
        },
      });
    }

    // Process derivatives asynchronously, then index
    this.derivativeService
      .processDerivatives(assetId, storageKey, mediaType, file.mimetype)
      .then(async (result) => {
        await this.prisma.mediaAsset.update({
          where: { id: assetId },
          data: {
            width: result.width,
            height: result.height,
            duration: result.duration,
            status: AssetStatus.READY,
          },
        });
        // 索引新 asset
        this.searchService.reindexAsset(assetId).catch((err) =>
          this.logger.error(`Index failed for ${assetId}:`, err),
        );
        this.logger.log(`Asset ${assetId} processed successfully`);
      })
      .catch(async (error) => {
        this.logger.error(`Failed to process asset ${assetId}:`, error);
        await this.prisma.mediaAsset.update({
          where: { id: assetId },
          data: { status: AssetStatus.FAILED },
        });
      });

    return {
      id: assetId,
      originalFilename: file.originalname,
      mediaType,
      status: AssetStatus.PROCESSING,
    };
  }

  private async resolveUploadTarget(groupId?: string, subgroupId?: string) {
    if (!groupId) {
      const target = await this.groupService.ensureDefaultHierarchy();
      return {
        groupId: target.group.id,
        subgroupId: target.subgroup.id,
      };
    }

    if (subgroupId) {
      return { groupId, subgroupId };
    }

    const subgroup = await this.groupService.ensureDefaultSubgroup(groupId);
    return { groupId, subgroupId: subgroup.id };
  }

  private extFromMime(mime: string): string {
    const map: Record<string, string> = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/avif': 'avif',
      'image/heic': 'heic',
      'image/heif': 'heif',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'audio/mpeg': 'mp3',
    };
    return map[mime] || 'bin';
  }
}
