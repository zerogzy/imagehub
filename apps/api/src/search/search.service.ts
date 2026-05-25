import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { Meilisearch, Index } from 'meilisearch';

@Injectable()
export class SearchService {
  private readonly logger = new Logger(SearchService.name);
  private readonly client: Meilisearch;
  private readonly indexPrefix: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.client = new Meilisearch({
      host: this.configService.get('MEILISEARCH_HOST', 'http://localhost:7700'),
      apiKey: this.configService.get('MEILISEARCH_API_KEY'),
    });
    this.indexPrefix = this.configService.get('MEILISEARCH_INDEX_PREFIX', 'imagehub_');
    this.initIndex();
  }

  private async initIndex() {
    try {
      const indexName = `${this.indexPrefix}assets`;
      const task = await this.client.createIndex(indexName, {
        primaryKey: 'assetId',
      });
      await this.client.waitForTask(task.taskUid);

      await this.client.index(indexName).updateSearchableAttributes([
        'originalFilename',
        'displayFilename',
        'tags',
        'tagAliases',
        'groupName',
        'subgroupName',
      ]);

      await this.client.index(indexName).updateFilterableAttributes([
        'mediaType',
        'groupId',
        'subgroupId',
        'tags',
      ]);

      await this.client.index(indexName).updateSortableAttributes([
        'createdAt',
        'originalFilename',
      ]);

      this.logger.log('Meilisearch index initialized');
    } catch (error) {
      this.logger.warn('Meilisearch init error (may already exist):', error.message);
    }
  }

  private getIndex(): Index {
    return this.client.index(`${this.indexPrefix}assets`);
  }

  private quoteFilterValue(value: string) {
    return JSON.stringify(value);
  }

  private getAssetInclude() {
    return {
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
    };
  }

  private formatGalleryAsset(asset: any) {
    return {
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
      thumbStorageKey: asset.derivatives.find((d: any) => d.derivativeType === 'thumb')?.storageKey || null,
      previewStorageKey: asset.derivatives.find((d: any) => d.derivativeType === 'preview')?.storageKey || null,
      groups: asset.groupAssets.map((ga: any) => ({
        groupId: ga.group.id,
        groupName: ga.group.name,
        groupSlug: ga.group.slug,
        subgroupId: ga.subgroup?.id || null,
        subgroupName: ga.subgroup?.name || null,
        rankKey: ga.rankKey,
      })),
      tags: asset.assetTags.map((at: any) => ({
        id: at.tag.id,
        name: at.tag.name,
        source: at.source,
      })),
      createdAt: asset.createdAt,
    };
  }

  private async hydrateSearchHits(hits: any[]) {
    const assetIds = hits.map((hit) => hit.assetId).filter(Boolean);
    if (assetIds.length === 0) return [];

    const assets = await this.prisma.mediaAsset.findMany({
      where: {
        id: { in: assetIds },
        status: 'ready',
      },
      include: this.getAssetInclude(),
    });

    const byId = new Map(assets.map((asset) => [asset.id, asset]));
    return assetIds
      .map((assetId) => byId.get(assetId))
      .filter(Boolean)
      .map((asset) => this.formatGalleryAsset(asset));
  }

  /**
   * Reindex a single asset by fetching all its data from DB.
   */
  async reindexAsset(assetId: string) {
    try {
      const asset = await this.prisma.mediaAsset.findUnique({
        where: { id: assetId },
        include: {
          assetTags: {
            include: { tag: true },
          },
          groupAssets: {
            include: { group: true, subgroup: true },
            take: 10,
          },
        },
      });

      if (!asset) {
        this.logger.warn(`reindexAsset: asset ${assetId} not found`);
        return;
      }

      const tags = asset.assetTags.map((at) => at.tag.name);
      const tagAliases: string[] = [];
      for (const at of asset.assetTags) {
        try {
          const aliases = JSON.parse(at.tag.aliasesJson || '[]');
          tagAliases.push(...aliases);
        } catch {}
      }

      const primaryGroup = asset.groupAssets[0];

      await this.indexAsset({
        assetId: asset.id,
        originalFilename: asset.originalFilename,
        displayFilename: asset.displayFilename || undefined,
        mediaType: asset.mediaType,
        groupId: primaryGroup?.groupId || undefined,
        groupName: primaryGroup?.group?.name || undefined,
        subgroupId: primaryGroup?.subgroupId || undefined,
        subgroupName: primaryGroup?.subgroup?.name || undefined,
        tags,
        tagAliases,
        createdAt: asset.createdAt,
        width: asset.width || undefined,
        height: asset.height || undefined,
        duration: asset.duration || undefined,
      });
    } catch (error) {
      this.logger.error(`reindexAsset ${assetId} failed:`, error);
    }
  }

  async indexAsset(asset: {
    assetId: string;
    originalFilename: string;
    displayFilename?: string;
    mediaType: string;
    groupId?: string;
    groupName?: string;
    subgroupId?: string;
    subgroupName?: string;
    tags: string[];
    tagAliases: string[];
    createdAt: Date;
    width?: number;
    height?: number;
    duration?: number;
  }) {
    try {
      await this.getIndex().addDocuments([
        {
          assetId: asset.assetId,
          originalFilename: asset.originalFilename,
          displayFilename: asset.displayFilename || asset.originalFilename,
          mediaType: asset.mediaType,
          groupId: asset.groupId || null,
          groupName: asset.groupName || null,
          subgroupId: asset.subgroupId || null,
          subgroupName: asset.subgroupName || null,
          tags: asset.tags,
          tagAliases: asset.tagAliases,
          createdAt: asset.createdAt.getTime(),
          width: asset.width || null,
          height: asset.height || null,
          duration: asset.duration || null,
        },
      ]);
    } catch (error) {
      this.logger.error(`Failed to index asset ${asset.assetId}:`, error);
    }
  }

  async unindexAsset(assetId: string) {
    try {
      await this.getIndex().deleteDocument(assetId);
    } catch (error) {
      this.logger.error(`Failed to unindex asset ${assetId}:`, error);
    }
  }

  async searchGlobal(params: {
    query: string;
    page?: number;
    pageSize?: number;
    mediaType?: string;
  }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;

    const filter: string[] = [];
    if (params.mediaType) {
      filter.push(`mediaType = ${this.quoteFilterValue(params.mediaType)}`);
    }

    const results = await this.getIndex().search(params.query, {
      page,
      hitsPerPage: pageSize,
      filter: filter.length > 0 ? filter : undefined,
    });

    return {
      assets: await this.hydrateSearchHits(results.hits),
      hits: results.hits,
      meta: {
        page: results.page || page,
        pageSize: results.hitsPerPage || pageSize,
        total: results.totalHits || 0,
        totalPages: results.totalPages || 0,
      },
    };
  }

  async searchGroup(params: {
    groupId: string;
    query: string;
    page?: number;
    pageSize?: number;
    subgroupId?: string;
    tag?: string;
    mediaType?: string;
  }) {
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;

    const filter: string[] = [`groupId = ${this.quoteFilterValue(params.groupId)}`];
    if (params.subgroupId) {
      filter.push(`subgroupId = ${this.quoteFilterValue(params.subgroupId)}`);
    }
    if (params.tag) {
      filter.push(`tags = ${this.quoteFilterValue(params.tag)}`);
    }
    if (params.mediaType) {
      filter.push(`mediaType = ${this.quoteFilterValue(params.mediaType)}`);
    }

    const results = await this.getIndex().search(params.query, {
      page,
      hitsPerPage: pageSize,
      filter,
    });

    return {
      assets: await this.hydrateSearchHits(results.hits),
      hits: results.hits,
      meta: {
        page: results.page || page,
        pageSize: results.hitsPerPage || pageSize,
        total: results.totalHits || 0,
        totalPages: results.totalPages || 0,
      },
    };
  }

  /**
   * Reindex all ready assets — for migration / recovery.
   */
  async reindexAll() {
    const assets = await this.prisma.mediaAsset.findMany({
      where: { status: 'ready' },
      select: { id: true },
    });
    for (const a of assets) {
      await this.reindexAsset(a.id);
    }
    return { total: assets.length };
  }
}
