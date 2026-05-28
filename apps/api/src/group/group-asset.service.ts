import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RANK_MAX, formatRank, rankBetween } from './group-rank.helper';

@Injectable()
export class GroupAssetService {
  constructor(private prisma: PrismaService) {}

  async moveAssetToGroup(params: {
    assetId: string;
    groupId: string;
    subgroupId?: string;
  }) {
    await this.prisma.groupAsset.deleteMany({
      where: {
        assetId: params.assetId,
        groupId: { not: params.groupId },
      },
    });

    const existing = await this.prisma.groupAsset.findUnique({
      where: { groupId_assetId: { groupId: params.groupId, assetId: params.assetId } },
    });

    if (existing) {
      return this.prisma.groupAsset.update({
        where: { id: existing.id },
        data: { subgroupId: params.subgroupId || null },
      });
    }

    const lastAsset = await this.prisma.groupAsset.findFirst({
      where: { groupId: params.groupId },
      orderBy: { rankKey: 'desc' },
      select: { rankKey: true },
    });

    const rankKey = lastAsset
      ? (parseInt(lastAsset.rankKey, 36) + 1).toString(36)
      : '1';

    return this.prisma.groupAsset.create({
      data: {
        groupId: params.groupId,
        subgroupId: params.subgroupId || null,
        assetId: params.assetId,
        rankKey,
      },
    });
  }

  async batchMoveAssetsToGroup(params: {
    assetIds: string[];
    groupId: string;
    subgroupId?: string;
  }) {
    const results = [];
    for (const assetId of params.assetIds) {
      results.push(
        await this.moveAssetToGroup({
          assetId,
          groupId: params.groupId,
          subgroupId: params.subgroupId,
        }),
      );
    }
    return results;
  }

  async moveGroupAssetRank(params: {
    assetId: string;
    groupId: string;
    subgroupId?: string | null;
    beforeAssetId?: string | null;
    afterAssetId?: string | null;
  }) {
    const group = await this.prisma.group.findUnique({
      where: { id: params.groupId },
      select: { randomEnabled: true },
    });
    if (!group) throw new BadRequestException('Group not found');
    if (group.randomEnabled) {
      throw new BadRequestException('Random enabled groups cannot be manually sorted');
    }

    const moving = await this.prisma.groupAsset.findUnique({
      where: { groupId_assetId: { groupId: params.groupId, assetId: params.assetId } },
    });
    if (!moving) throw new BadRequestException('Asset is not in this group');

    const normalizedSubgroupId = params.subgroupId || null;
    if ((moving.subgroupId || null) !== normalizedSubgroupId) {
      throw new BadRequestException('Asset is not in the target subgroup');
    }

    const scopeWhere = {
      groupId: params.groupId,
      subgroupId: normalizedSubgroupId,
    };

    let before = params.beforeAssetId
      ? await this.prisma.groupAsset.findUnique({
          where: { groupId_assetId: { groupId: params.groupId, assetId: params.beforeAssetId } },
        })
      : null;
    let after = params.afterAssetId
      ? await this.prisma.groupAsset.findUnique({
          where: { groupId_assetId: { groupId: params.groupId, assetId: params.afterAssetId } },
        })
      : null;

    for (const neighbor of [before, after]) {
      if (!neighbor) continue;
      if ((neighbor.subgroupId || null) !== normalizedSubgroupId) {
        throw new BadRequestException('Cannot sort across subgroups');
      }
    }

    if (!before && !after) {
      after = await this.prisma.groupAsset.findFirst({
        where: { ...scopeWhere, assetId: { not: params.assetId } },
        orderBy: { rankKey: 'desc' },
      });
    }

    let nextRank = rankBetween(after?.rankKey || null, before?.rankKey || null);
    if (!nextRank) {
      await this.rebalanceGroupAssetRanks(params.groupId, normalizedSubgroupId);
      before = params.beforeAssetId
        ? await this.prisma.groupAsset.findUnique({
            where: { groupId_assetId: { groupId: params.groupId, assetId: params.beforeAssetId } },
          })
        : null;
      after = params.afterAssetId
        ? await this.prisma.groupAsset.findUnique({
            where: { groupId_assetId: { groupId: params.groupId, assetId: params.afterAssetId } },
          })
        : null;
      nextRank = rankBetween(after?.rankKey || null, before?.rankKey || null);
    }

    if (!nextRank) throw new BadRequestException('Unable to generate rank key');

    return this.prisma.groupAsset.update({
      where: { id: moving.id },
      data: { rankKey: nextRank },
    });
  }

  async rebalanceGroupAssetRanks(groupId: string, subgroupId: string | null) {
    const items = await this.prisma.groupAsset.findMany({
      where: { groupId, subgroupId },
      orderBy: { rankKey: 'asc' },
      select: { id: true },
    });
    const step = RANK_MAX / BigInt(items.length + 1);
    await this.prisma.$transaction(
      items.map((item, index) =>
        this.prisma.groupAsset.update({
          where: { id: item.id },
          data: { rankKey: formatRank(step * BigInt(index + 1)) },
        }),
      ),
    );
  }
}
