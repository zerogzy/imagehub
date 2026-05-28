import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SubgroupService } from './subgroup.service';
import {
  DEFAULT_GROUP_NAME,
  DEFAULT_GROUP_SLUG,
  uniqueGroupSlug,
} from './group-slug.helper';

@Injectable()
export class GroupService {
  constructor(
    private prisma: PrismaService,
    private subgroupService: SubgroupService,
  ) {}

  async listGroups() {
    await this.ensureDefaultHierarchy();
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

  async getGroup(groupId: string) {
    return this.prisma.group.findUnique({
      where: { id: groupId },
      include: {
        subgroups: { orderBy: { rankKey: 'asc' } },
        _count: { select: { groupAssets: true } },
      },
    });
  }

  async createGroup(data: {
    name: string;
    slug: string;
    description?: string | null;
    randomEnabled?: boolean;
    randomRotateInterval?: number;
  }) {
    const trimmedName = data.name.trim();
    const existing = await this.prisma.group.findFirst({
      where: { name: trimmedName },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`分组名称 "${trimmedName}" 已存在`);
    }

    const lastGroup = await this.prisma.group.findFirst({
      orderBy: { rankKey: 'desc' },
      select: { rankKey: true },
    });

    const rankKey = lastGroup
      ? (parseInt(lastGroup.rankKey, 36) + 1).toString(36)
      : '1';

    return this.prisma.$transaction(async (tx) => {
      const group = await tx.group.create({
        data: {
          name: data.name,
          slug: await uniqueGroupSlug(data.slug || data.name, tx),
          description: data.description,
          rankKey,
          randomEnabled: data.randomEnabled || false,
          randomRotateInterval: data.randomRotateInterval,
        },
      });

      await tx.subgroup.create({
        data: {
          groupId: group.id,
          name: DEFAULT_GROUP_NAME,
          rankKey: '1',
        },
      });

      return group;
    });
  }

  async updateGroup(
    groupId: string,
    data: {
      name?: string;
      slug?: string;
      description?: string | null;
      randomEnabled?: boolean;
      randomRotateInterval?: number;
    },
  ) {
    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      const existing = await this.prisma.group.findFirst({
        where: { name: trimmedName, id: { not: groupId } },
        select: { id: true },
      });
      if (existing) {
        throw new BadRequestException(`分组名称 "${trimmedName}" 已存在`);
      }
    }
    return this.prisma.group.update({
      where: { id: groupId },
      data,
    });
  }

  async deleteGroup(groupId: string) {
    const target = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { id: true, slug: true, name: true },
    });
    if (!target) {
      throw new BadRequestException('分组不存在');
    }
    if (this.isDefaultGroup(target)) {
      throw new BadRequestException('默认分组不可删除');
    }

    const { group: defaultGroup, subgroup: defaultSubgroup } = await this.ensureDefaultHierarchy();
    if (defaultGroup.id === groupId) {
      throw new BadRequestException('默认分组不可删除');
    }

    return this.prisma.$transaction(async (tx) => {
      const groupAssets = await tx.groupAsset.findMany({
        where: { groupId },
        select: { id: true, assetId: true },
      });

      if (groupAssets.length > 0) {
        const assetIds = groupAssets.map((ga) => ga.assetId);
        const existingInDefault = await tx.groupAsset.findMany({
          where: { groupId: defaultGroup.id, assetId: { in: assetIds } },
          select: { assetId: true },
        });
        const existingSet = new Set(existingInDefault.map((ga) => ga.assetId));
        const toMigrate = groupAssets.filter((ga) => !existingSet.has(ga.assetId));

        if (toMigrate.length > 0) {
          const lastAsset = await tx.groupAsset.findFirst({
            where: { groupId: defaultGroup.id },
            orderBy: { rankKey: 'desc' },
            select: { rankKey: true },
          });
          let nextRank = lastAsset ? parseInt(lastAsset.rankKey, 36) + 1 : 1;
          for (const ga of toMigrate) {
            await tx.groupAsset.update({
              where: { id: ga.id },
              data: {
                groupId: defaultGroup.id,
                subgroupId: defaultSubgroup.id,
                rankKey: nextRank.toString(36),
              },
            });
            nextRank += 1;
          }
        }
      }

      return tx.group.delete({ where: { id: groupId } });
    });
  }

  async reorderGroups(orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
      this.prisma.group.update({
        where: { id },
        data: { rankKey: index.toString(36) },
      }),
    );
    return Promise.all(updates);
  }

  async ensureDefaultHierarchy() {
    return this.prisma.$transaction(async (tx) => {
      let group = await tx.group.findFirst({
        where: {
          OR: [
            { slug: DEFAULT_GROUP_SLUG },
            { name: DEFAULT_GROUP_NAME },
          ],
        },
        include: { subgroups: { orderBy: { rankKey: 'asc' } } },
      });

      if (group) {
        group = await tx.group.update({
          where: { id: group.id },
          data: {
            name: DEFAULT_GROUP_NAME,
            rankKey: '0',
          },
          include: { subgroups: { orderBy: { rankKey: 'asc' } } },
        });
      } else {
        group = await tx.group.create({
          data: {
            name: DEFAULT_GROUP_NAME,
            slug: await uniqueGroupSlug(DEFAULT_GROUP_SLUG, tx),
            rankKey: '0',
          },
          include: { subgroups: { orderBy: { rankKey: 'asc' } } },
        });
      }

      const existingDefaultSubgroup = group.subgroups.find(
        (subgroup) => subgroup.name === DEFAULT_GROUP_NAME,
      );
      const defaultSubgroup =
        existingDefaultSubgroup ||
        (await tx.subgroup.create({
          data: {
            groupId: group.id,
            name: DEFAULT_GROUP_NAME,
            rankKey: '1',
          },
        }));

      return { group, subgroup: defaultSubgroup };
    });
  }

  async ensureDefaultSubgroup(groupId: string) {
    return this.subgroupService.ensureDefaultSubgroup(groupId);
  }

  private isDefaultGroup(group: { slug?: string | null; name?: string | null }) {
    return group.slug === DEFAULT_GROUP_SLUG || group.name === DEFAULT_GROUP_NAME;
  }
}
