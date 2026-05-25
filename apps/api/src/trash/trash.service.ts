import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { AssetStatus } from '@imagehub/shared';

@Injectable()
export class TrashService {
  constructor(
    private prisma: PrismaService,
    private storageService: StorageService,
  ) {}

  /**
   * List trashed items.
   */
  async listTrashed(params: { page?: number; pageSize?: number } = {}) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;

    const [items, total] = await Promise.all([
      this.prisma.trashItem.findMany({
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          asset: {
            select: {
              id: true,
              originalFilename: true,
              mediaType: true,
              mimeType: true,
              sizeBytes: true,
              width: true,
              height: true,
              createdAt: true,
              derivatives: {
                where: { derivativeType: 'thumb' },
                take: 1,
                select: {
                  storageKey: true,
                  derivativeType: true,
                },
              },
            },
          },
        },
        orderBy: { deletedAt: 'desc' },
      }),
      this.prisma.trashItem.count(),
    ]);

    return {
      items: items.map((item) => ({
        ...item,
        asset: {
          ...item.asset,
          sizeBytes: item.asset.sizeBytes.toString(),
          thumbStorageKey: item.asset.derivatives[0]?.storageKey || null,
        },
      })),
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    };
  }

  /**
   * Restore a trashed asset.
   */
  async restore(assetId: string) {
    const trashItem = await this.prisma.trashItem.findUnique({
      where: { assetId },
    });

    if (!trashItem) return null;

    // Restore asset status
    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: {
        status: trashItem.originalStatus || AssetStatus.READY,
        deletedAt: null,
      },
    });

    // Remove from trash
    await this.prisma.trashItem.delete({
      where: { assetId },
    });

    return { success: true };
  }

  /**
   * Permanently delete an asset and all associated files.
   */
  async purge(assetId: string) {
    const trashItem = await this.prisma.trashItem.findUnique({
      where: { assetId },
      include: {
        asset: {
          include: {
            derivatives: true,
          },
        },
      },
    });

    if (!trashItem) return null;

    // Collect all storage keys to delete
    const storageKeys = [
      trashItem.asset.storageKey,
      ...trashItem.asset.derivatives.map((d) => d.storageKey),
    ];

    // Delete all files
    await this.storageService.deleteMultiple(storageKeys);

    // Delete from database (cascade will handle related records)
    await this.prisma.mediaAsset.delete({
      where: { id: assetId },
    });

    return { success: true };
  }

  /**
   * Batch restore.
   */
  async batchRestore(assetIds: string[]) {
    const results = [];
    for (const assetId of assetIds) {
      const result = await this.restore(assetId);
      results.push({ assetId, success: !!result });
    }
    return results;
  }

  /**
   * Batch permanent delete.
   */
  async batchPurge(assetIds: string[]) {
    const results = [];
    for (const assetId of assetIds) {
      const result = await this.purge(assetId);
      results.push({ assetId, success: !!result });
    }
    return results;
  }
}
