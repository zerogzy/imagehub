import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SearchService } from '../search/search.service';

@Injectable()
export class TagService {
  constructor(
    private prisma: PrismaService,
    private searchService: SearchService,
  ) {}

  async listTags() {
    return this.prisma.tag.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { assetTags: true } },
      },
    });
  }

  async createTag(data: { name: string; aliases?: string[] }) {
    const name = data.name.trim();
    const normalizedName = name.toLowerCase();
    const existing = await this.prisma.tag.findUnique({
      where: { normalizedName },
    });

    if (existing) return existing;

    return this.prisma.tag.create({
      data: {
        name,
        normalizedName,
        aliasesJson: JSON.stringify(data.aliases || []),
      },
    });
  }

  async updateTag(
    tagId: string,
    data: { name?: string; aliases?: string[] },
  ) {
    const updateData: any = {};
    if (data.name) {
      updateData.name = data.name.trim();
      updateData.normalizedName = data.name.toLowerCase().trim();
    }
    if (data.aliases !== undefined) {
      updateData.aliasesJson = JSON.stringify(data.aliases);
    }
    const tag = await this.prisma.tag.update({
      where: { id: tagId },
      data: updateData,
    });

    // Tag name changed — reindex all assets with this tag
    const assetTags = await this.prisma.assetTag.findMany({
      where: { tagId },
      select: { assetId: true },
    });
    for (const at of assetTags) {
      this.searchService.reindexAsset(at.assetId).catch(() => {});
    }

    return tag;
  }

  async deleteTag(tagId: string) {
    // Reindex affected assets before deleting
    const assetTags = await this.prisma.assetTag.findMany({
      where: { tagId },
      select: { assetId: true },
    });

    await this.prisma.tag.delete({ where: { id: tagId } });

    for (const at of assetTags) {
      this.searchService.reindexAsset(at.assetId).catch(() => {});
    }
  }

  async addTagToAsset(params: {
    assetId: string;
    tagId: string;
    source?: string;
    confidence?: number;
  }) {
    const result = await this.prisma.assetTag.create({
      data: {
        assetId: params.assetId,
        tagId: params.tagId,
        source: params.source || 'admin',
        confidence: params.confidence,
      },
    });

    // 标签变更后同步索引
    this.searchService.reindexAsset(params.assetId).catch(() => {});

    return result;
  }

  async removeTagFromAsset(assetId: string, tagId: string) {
    const result = await this.prisma.assetTag.delete({
      where: { assetId_tagId: { assetId, tagId } },
    });

    // 标签变更后同步索引
    this.searchService.reindexAsset(assetId).catch(() => {});

    return result;
  }

  async batchTagAssets(params: {
    assetIds: string[];
    tagId: string;
    source?: string;
  }) {
    const results = [];
    for (const assetId of params.assetIds) {
      try {
        results.push(
          await this.addTagToAsset({
            assetId,
            tagId: params.tagId,
            source: params.source || 'batch',
          }),
        );
      } catch {
        // Already tagged, skip
      }
    }
    return results;
  }

  async batchTagAssetsByNames(params: {
    assetIds: string[];
    names: string[];
    source?: string;
  }) {
    const names = Array.from(
      new Set(params.names.map((name) => name.trim()).filter(Boolean)),
    );
    const tags = [];

    for (const name of names) {
      tags.push(await this.createTag({ name }));
    }

    for (const tag of tags) {
      await this.batchTagAssets({
        assetIds: params.assetIds,
        tagId: tag.id,
        source: params.source || 'admin',
      });
    }

    return tags;
  }

  async batchUntagAssets(assetIds: string[], tagId: string) {
    const results = [];
    for (const assetId of assetIds) {
      try {
        results.push(await this.removeTagFromAsset(assetId, tagId));
      } catch {
        // Not tagged, skip
      }
    }
    return results;
  }
}
