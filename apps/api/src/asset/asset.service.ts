import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AssetStatus } from '@imagehub/shared';

@Injectable()
export class AssetService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get gallery assets with pagination and filtering.
   */
  async getGallery(params: {
    groupId?: string;
    subgroupId?: string;
    page?: number;
    pageSize?: number;
    seed?: string;
    sortMode?: string;
    mediaType?: string;
    tag?: string;
  }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 40;
    const skip = (page - 1) * pageSize;
    const normalizedSubgroupId = params.subgroupId === 'null' ? null : params.subgroupId;

    const where: any = {
      status: AssetStatus.READY,
    };

    // Filter by group
    if (params.groupId || normalizedSubgroupId !== undefined) {
      where.groupAssets = {
        some: {
          ...(params.groupId && { groupId: params.groupId }),
          ...(normalizedSubgroupId !== undefined && { subgroupId: normalizedSubgroupId }),
        },
      };
    }

    // Filter by media type
    if (params.mediaType) {
      where.mediaType = params.mediaType;
    }

    // Filter by tag
    if (params.tag) {
      where.assetTags = {
        some: {
          tag: {
            OR: [
              { name: params.tag },
              { normalizedName: params.tag.toLowerCase() },
            ],
          },
        },
      };
    }

    const shouldSortByRank = !!params.groupId
      && params.sortMode !== 'newest'
      && params.sortMode !== 'oldest'
      && params.sortMode !== 'random';

    let orderBy: any = { createdAt: 'desc' };
    if (params.sortMode === 'newest') {
      orderBy = { createdAt: 'desc' };
    } else if (params.sortMode === 'oldest') {
      orderBy = { createdAt: 'asc' };
    }

    const [allAssets, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        skip: shouldSortByRank ? undefined : skip,
        take: shouldSortByRank ? undefined : pageSize,
        orderBy,
        include: {
          derivatives: {
            where: { derivativeType: { in: ['thumb', 'preview'] } },
            select: {
              derivativeType: true,
              storageKey: true,
            },
          },
          groupAssets: {
            include: {
              group: { select: { id: true, name: true, slug: true } },
              subgroup: { select: { id: true, name: true } },
            },
          },
          assetTags: {
            include: {
              tag: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    const orderedAssets = shouldSortByRank
      ? [...allAssets].sort((a, b) => {
          const aRank = a.groupAssets.find((ga) => (
            ga.groupId === params.groupId && (normalizedSubgroupId === undefined || ga.subgroupId === normalizedSubgroupId)
          ))?.rankKey || '';
          const bRank = b.groupAssets.find((ga) => (
            ga.groupId === params.groupId && (normalizedSubgroupId === undefined || ga.subgroupId === normalizedSubgroupId)
          ))?.rankKey || '';
          return aRank.localeCompare(bRank);
        })
      : allAssets;
    const assets = shouldSortByRank
      ? orderedAssets.slice(skip, skip + pageSize)
      : orderedAssets;

    const assetIds = assets.map((asset) => asset.id);
    const eventCounts = assetIds.length > 0
      ? await this.prisma.accessEvent.groupBy({
          by: ['assetId', 'eventType'],
          where: { assetId: { in: assetIds } },
          _count: { _all: true },
        })
      : [];
    const statsByAsset = new Map<string, { viewCount: number; downloadCount: number }>();
    for (const count of eventCounts) {
      const stats = statsByAsset.get(count.assetId) || { viewCount: 0, downloadCount: 0 };
      if (count.eventType === 'detail_view' || count.eventType === 'api_detail') {
        stats.viewCount += count._count._all;
      }
      if (count.eventType === 'download' || count.eventType === 'batch_download' || count.eventType === 'permanent_share_download') {
        stats.downloadCount += count._count._all;
      }
      statsByAsset.set(count.assetId, stats);
    }

    return {
      assets: assets.map((asset) => ({
        id: asset.id,
        originalFilename: asset.originalFilename,
        displayFilename: asset.displayFilename,
        mediaType: asset.mediaType,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        duration: asset.duration,
        sizeBytes: asset.sizeBytes.toString(),
        status: asset.status,
        viewCount: statsByAsset.get(asset.id)?.viewCount || 0,
        downloadCount: statsByAsset.get(asset.id)?.downloadCount || 0,
        thumbStorageKey: asset.derivatives.find((d) => d.derivativeType === 'thumb')?.storageKey || null,
        previewStorageKey: asset.derivatives.find((d) => d.derivativeType === 'preview')?.storageKey || null,
        groups: asset.groupAssets.map((ga) => ({
          groupId: ga.group.id,
          groupName: ga.group.name,
          groupSlug: ga.group.slug,
          subgroupId: ga.subgroup?.id || null,
          subgroupName: ga.subgroup?.name || null,
          rankKey: ga.rankKey,
        })),
        tags: asset.assetTags.map((at) => ({
          id: at.tag.id,
          name: at.tag.name,
          source: at.source,
        })),
        createdAt: asset.createdAt,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Admin: List all assets (including non-ready and trashed).
   */
  async listAdminAssets(params: {
    page?: number;
    pageSize?: number;
    mediaType?: string;
    status?: string;
    search?: string;
    groupId?: string;
    subgroupId?: string;
  }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 40;
    const skip = (page - 1) * pageSize;
    const normalizedSubgroupId = params.subgroupId === 'null' ? null : params.subgroupId;

    const where: any = {};

    if (params.mediaType) {
      where.mediaType = params.mediaType;
    }

    if (params.status) {
      where.status = params.status;
    } else {
      // By default, exclude trashed from admin list
      where.status = { not: AssetStatus.TRASHED };
    }

    if (params.search) {
      where.OR = [
        { originalFilename: { contains: params.search } },
        { displayFilename: { contains: params.search } },
      ];
    }

    if (params.groupId || normalizedSubgroupId !== undefined) {
      where.groupAssets = {
        some: {
          groupId: params.groupId,
          ...(normalizedSubgroupId !== undefined && { subgroupId: normalizedSubgroupId }),
        },
      };
    }

    const shouldSortByRank = !!params.groupId && !params.search;
    const [allAssets, total] = await Promise.all([
      this.prisma.mediaAsset.findMany({
        where,
        skip: shouldSortByRank ? undefined : skip,
        take: shouldSortByRank ? undefined : pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          derivatives: {
            where: { derivativeType: 'thumb' },
            take: 1,
          },
          groupAssets: {
            include: {
              group: { select: { id: true, name: true } },
              subgroup: { select: { id: true, name: true } },
            },
          },
          assetTags: {
            include: {
              tag: { select: { id: true, name: true } },
            },
          },
        },
      }),
      this.prisma.mediaAsset.count({ where }),
    ]);

    const orderedAssets = params.groupId
      ? [...allAssets].sort((a, b) => {
          const aRank = a.groupAssets.find((ga) => (
            ga.groupId === params.groupId && (normalizedSubgroupId === undefined || ga.subgroupId === normalizedSubgroupId)
          ))?.rankKey || '';
          const bRank = b.groupAssets.find((ga) => (
            ga.groupId === params.groupId && (normalizedSubgroupId === undefined || ga.subgroupId === normalizedSubgroupId)
          ))?.rankKey || '';
          return aRank.localeCompare(bRank);
        })
      : allAssets;
    const pagedAssets = shouldSortByRank
      ? orderedAssets.slice(skip, skip + pageSize)
      : orderedAssets;

    const adminAssetIds = pagedAssets.map((asset) => asset.id);
    const adminEventCounts = adminAssetIds.length > 0
      ? await this.prisma.accessEvent.groupBy({
          by: ['assetId', 'eventType'],
          where: { assetId: { in: adminAssetIds } },
          _count: { _all: true },
        })
      : [];
    const adminStatsByAsset = new Map<string, { viewCount: number; downloadCount: number }>();
    for (const count of adminEventCounts) {
      const stats = adminStatsByAsset.get(count.assetId) || { viewCount: 0, downloadCount: 0 };
      if (count.eventType === 'detail_view' || count.eventType === 'api_detail') {
        stats.viewCount += count._count._all;
      }
      if (count.eventType === 'download' || count.eventType === 'batch_download' || count.eventType === 'permanent_share_download') {
        stats.downloadCount += count._count._all;
      }
      adminStatsByAsset.set(count.assetId, stats);
    }

    return {
      assets: pagedAssets.map((asset) => ({
        id: asset.id,
        originalFilename: asset.originalFilename,
        displayFilename: asset.displayFilename,
        mediaType: asset.mediaType,
        mimeType: asset.mimeType,
        width: asset.width,
        height: asset.height,
        sizeBytes: asset.sizeBytes.toString(),
        status: asset.status,
        viewCount: adminStatsByAsset.get(asset.id)?.viewCount || 0,
        downloadCount: adminStatsByAsset.get(asset.id)?.downloadCount || 0,
        thumbStorageKey: asset.derivatives[0]?.storageKey || null,
        groups: asset.groupAssets.map((ga) => ({
          groupId: ga.group.id,
          groupName: ga.group.name,
          subgroupId: ga.subgroup?.id || null,
          subgroupName: ga.subgroup?.name || null,
          rankKey: ga.rankKey,
        })),
        tags: asset.assetTags.map((at) => ({
          id: at.tag.id,
          name: at.tag.name,
        })),
        createdAt: asset.createdAt,
      })),
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  /**
   * Get a single asset by ID with full details.
   */
  async getAssetById(assetId: string, includeAdminFields = false) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
      include: {
        derivatives: true,
        groupAssets: {
          include: {
            group: { select: { id: true, name: true, slug: true } },
            subgroup: { select: { id: true, name: true } },
          },
        },
        assetTags: {
          include: {
            tag: { select: { id: true, name: true } },
          },
        },
        ...(includeAdminFields && {
          downloadShares: {
            where: { enabled: true },
            select: {
              id: true,
              shareId: true,
              downloadCount: true,
              lastAccessedAt: true,
              createdAt: true,
            },
          },
        }),
      },
    });

    if (!asset || asset.status === AssetStatus.TRASHED) {
      return null;
    }

    const stats = includeAdminFields
      ? await this.getAssetStats(asset.id)
      : undefined;

    return {
      ...asset,
      ...(stats && { stats }),
      sizeBytes: asset.sizeBytes.toString(),
      derivatives: asset.derivatives.map((derivative) => ({
        ...derivative,
        sizeBytes: derivative.sizeBytes?.toString() || null,
      })),
    };
  }

  /**
   * Update asset metadata.
   */
  async updateAsset(
    assetId: string,
    data: {
      displayFilename?: string;
    },
  ) {
    return this.prisma.mediaAsset.update({
      where: { id: assetId },
      data,
    });
  }

  /**
   * Soft-delete an asset (move to trash).
   */
  async softDeleteAsset(assetId: string, tokenId: string, reason?: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id: assetId },
    });

    if (!asset) return null;
    if (asset.status === AssetStatus.TRASHED) return { success: true };

    await this.prisma.mediaAsset.update({
      where: { id: assetId },
      data: { status: AssetStatus.TRASHED, deletedAt: new Date() },
    });

    await this.prisma.trashItem.upsert({
      where: { assetId },
      create: {
        assetId,
        deletedByTokenId: tokenId,
        deleteReason: reason,
        originalStatus: asset.status,
        restoreUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      },
      update: {
        deletedByTokenId: tokenId,
        deleteReason: reason,
        restoreUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    });

    return { success: true };
  }

  /**
   * Batch soft-delete assets.
   */
  async batchSoftDelete(assetIds: string[], tokenId: string, reason?: string) {
    const results = [];
    for (const assetId of assetIds) {
      const result = await this.softDeleteAsset(assetId, tokenId, reason);
      results.push({ assetId, success: !!result });
    }
    return results;
  }

  /**
   * Get all groups for an asset.
   */
  async getAssetGroups(assetId: string) {
    return this.prisma.groupAsset.findMany({
      where: { assetId },
      include: {
        group: true,
        subgroup: true,
      },
    });
  }

  private async getAssetStats(assetId: string) {
    const eventCounts = await this.prisma.accessEvent.groupBy({
      by: ['eventType'],
      where: { assetId },
      _count: { _all: true },
    });
    let viewCount = 0;
    let downloadCount = 0;
    for (const count of eventCounts) {
      if (count.eventType === 'detail_view' || count.eventType === 'api_detail') {
        viewCount += count._count._all;
      }
      if (count.eventType === 'download' || count.eventType === 'batch_download' || count.eventType === 'permanent_share_download') {
        downloadCount += count._count._all;
      }
    }
    return { viewCount, downloadCount };
  }
}
