import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class GroupService {
  constructor(private prisma: PrismaService) {}
  private readonly RANK_WIDTH = 12;
  private readonly RANK_RADIX = 36n;
  private readonly RANK_MAX = this.RANK_RADIX ** BigInt(this.RANK_WIDTH) - 1n;

  /**
   * List all groups ordered by rankKey.
   * Includes subgroups and their asset counts.
   */
  async listGroups() {
    return this.prisma.group.findMany({
      orderBy: { rankKey: 'asc' },
      include: {
        _count: { select: { groupAssets: true, subgroups: true } },
        subgroups: {
          orderBy: { rankKey: 'asc' },
          include: {
            _count: { select: { groupAssets: true } },
          },
        },
      },
    });
  }

  /**
   * Get a single group by ID.
   */
  async getGroup(groupId: string) {
    return this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        subgroups: { orderBy: { rankKey: 'asc' } },
        _count: { select: { groupAssets: true } },
      },
    });
  }

  /**
   * Create a new group.
   */
  async createGroup(data: {
    name: string;
    slug: string;
    description?: string;
    randomEnabled?: boolean;
    randomRotateInterval?: number;
  }) {
    // Get the max rankKey to append at end
    const lastGroup = await this.prisma.group.findFirst({
      orderBy: { rankKey: 'desc' },
      select: { rankKey: true },
    });

    const rankKey = lastGroup
      ? (parseInt(lastGroup.rankKey, 36) + 1).toString(36)
      : '1';

    return this.prisma.group.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        rankKey,
        randomEnabled: data.randomEnabled || false,
        randomRotateInterval: data.randomRotateInterval,
      },
    });
  }

  /**
   * Update a group.
   */
  async updateGroup(
    groupId: string,
    data: {
      name?: string;
      slug?: string;
      description?: string;
      randomEnabled?: boolean;
      randomRotateInterval?: number;
    },
  ) {
    return this.prisma.group.update({
      where: { id: groupId },
      data,
    });
  }

  /**
   * Delete a group and all its subgroups and asset relationships.
   */
  async deleteGroup(groupId: string) {
    return this.prisma.group.delete({
      where: { id: groupId },
    });
  }

  /**
   * Reorder groups.
   */
  async reorderGroups(orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
      this.prisma.group.update({
        where: { id },
        data: { rankKey: index.toString(36) },
      }),
    );
    return Promise.all(updates);
  }

  // ---- Subgroups ----

  /**
   * List subgroups for a group.
   */
  async listSubgroups(groupId: string) {
    return this.prisma.subgroup.findMany({
      where: { groupId },
      orderBy: { rankKey: 'asc' },
      include: {
        _count: { select: { groupAssets: true } },
      },
    });
  }

  /**
   * Create a subgroup.
   */
  async createSubgroup(data: {
    groupId: string;
    name: string;
    description?: string;
  }) {
    const lastSub = await this.prisma.subgroup.findFirst({
      where: { groupId: data.groupId },
      orderBy: { rankKey: 'desc' },
      select: { rankKey: true },
    });

    const rankKey = lastSub
      ? (parseInt(lastSub.rankKey, 36) + 1).toString(36)
      : '1';

    return this.prisma.subgroup.create({
      data: {
        groupId: data.groupId,
        name: data.name,
        description: data.description,
        rankKey,
      },
    });
  }

  /**
   * Update a subgroup.
   */
  async updateSubgroup(
    subgroupId: string,
    data: { name?: string; description?: string },
  ) {
    return this.prisma.subgroup.update({
      where: { id: subgroupId },
      data,
    });
  }

  /**
   * Delete a subgroup.
   */
  async deleteSubgroup(subgroupId: string) {
    return this.prisma.subgroup.delete({
      where: { id: subgroupId },
    });
  }

  /**
   * Reorder subgroups.
   */
  async reorderSubgroups(orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
      this.prisma.subgroup.update({
        where: { id },
        data: { rankKey: index.toString(36) },
      }),
    );
    return Promise.all(updates);
  }

  /**
   * Move asset to a group/subgroup.
   */
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

    // Check if already in this group
    const existing = await this.prisma.groupAsset.findUnique({
      where: { groupId_assetId: { groupId: params.groupId, assetId: params.assetId } },
    });

    if (existing) {
      // Update subgroup
      return this.prisma.groupAsset.update({
        where: { id: existing.id },
        data: { subgroupId: params.subgroupId || null },
      });
    }

    // Create new relationship
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

  /**
   * Batch move assets to a group.
   */
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

    let nextRank = this.rankBetween(after?.rankKey || null, before?.rankKey || null);
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
      nextRank = this.rankBetween(after?.rankKey || null, before?.rankKey || null);
    }

    if (!nextRank) throw new BadRequestException('Unable to generate rank key');

    return this.prisma.groupAsset.update({
      where: { id: moving.id },
      data: { rankKey: nextRank },
    });
  }

  private rankBetween(afterRank: string | null, beforeRank: string | null) {
    const low = afterRank ? this.parseRank(afterRank) : 0n;
    const high = beforeRank ? this.parseRank(beforeRank) : this.RANK_MAX;
    if (high - low <= 1n) return null;
    return this.formatRank((low + high) / 2n);
  }

  private parseRank(rank: string) {
    let value = 0n;
    for (const char of rank.toLowerCase()) {
      const digit = BigInt(parseInt(char, 36));
      if (digit < 0n || digit >= this.RANK_RADIX) continue;
      value = value * this.RANK_RADIX + digit;
    }
    return value;
  }

  private formatRank(value: bigint) {
    return value.toString(36).padStart(this.RANK_WIDTH, '0');
  }

  private async rebalanceGroupAssetRanks(groupId: string, subgroupId: string | null) {
    const items = await this.prisma.groupAsset.findMany({
      where: { groupId, subgroupId },
      orderBy: { rankKey: 'asc' },
      select: { id: true },
    });
    const step = this.RANK_MAX / BigInt(items.length + 1);
    await this.prisma.$transaction(
      items.map((item, index) =>
        this.prisma.groupAsset.update({
          where: { id: item.id },
          data: { rankKey: this.formatRank(step * BigInt(index + 1)) },
        }),
      ),
    );
  }
}
