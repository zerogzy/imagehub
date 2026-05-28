import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_GROUP_NAME } from './group-slug.helper';

@Injectable()
export class SubgroupService {
  constructor(private prisma: PrismaService) {}

  async listSubgroups(groupId: string) {
    return this.prisma.subgroup.findMany({
      where: { groupId },
      orderBy: { rankKey: 'asc' },
      include: {
        _count: { select: { groupAssets: true } },
      },
    });
  }

  async createSubgroup(data: {
    groupId: string;
    name: string;
    description?: string | null;
  }) {
    const trimmedName = data.name.trim();
    const existing = await this.prisma.subgroup.findFirst({
      where: { groupId: data.groupId, name: trimmedName },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(`该分组下已存在名为 "${trimmedName}" 的二级分组`);
    }

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

  async updateSubgroup(
    subgroupId: string,
    data: { name?: string; description?: string },
  ) {
    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      const subgroup = await this.prisma.subgroup.findUnique({
        where: { id: subgroupId },
        select: { groupId: true },
      });
      if (subgroup) {
        const existing = await this.prisma.subgroup.findFirst({
          where: { groupId: subgroup.groupId, name: trimmedName, id: { not: subgroupId } },
          select: { id: true },
        });
        if (existing) {
          throw new BadRequestException(`该分组下已存在名为 "${trimmedName}" 的二级分组`);
        }
      }
    }
    return this.prisma.subgroup.update({
      where: { id: subgroupId },
      data,
    });
  }

  async deleteSubgroup(subgroupId: string) {
    return this.prisma.subgroup.delete({
      where: { id: subgroupId },
    });
  }

  async reorderSubgroups(orderedIds: string[]) {
    const updates = orderedIds.map((id, index) =>
      this.prisma.subgroup.update({
        where: { id },
        data: { rankKey: index.toString(36) },
      }),
    );
    return Promise.all(updates);
  }

  async ensureDefaultSubgroup(groupId: string) {
    const existing = await this.prisma.subgroup.findFirst({
      where: { groupId, name: DEFAULT_GROUP_NAME },
      orderBy: { rankKey: 'asc' },
    });
    if (existing) return existing;

    return this.prisma.subgroup.create({
      data: {
        groupId,
        name: DEFAULT_GROUP_NAME,
        rankKey: '1',
      },
    });
  }
}
