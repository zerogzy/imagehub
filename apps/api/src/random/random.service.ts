import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class RandomService {
  private readonly logger = new Logger(RandomService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Get or create a seed for a group.
   * If the group has random enabled, return its current seed.
   * If the seed has expired (past rotate interval), generate a new one.
   */
  async getGroupSeed(groupId: string, userSeed?: string) {
    // If user provides a seed, use it (for "fixed seed" feature)
    if (userSeed) {
      return userSeed;
    }

    const group = await this.prisma.group.findUnique({
      where: { id: groupId },
    });

    if (!group || !group.randomEnabled) {
      return null; // No random for this group
    }

    // Check if seed needs rotation
    if (group.currentSeed && group.randomRotateInterval) {
      const lastRotated = group.lastSeedRotatedAt || group.updatedAt;
      const now = new Date();
      const elapsed = (now.getTime() - lastRotated.getTime()) / (1000 * 60); // minutes

      if (elapsed >= group.randomRotateInterval) {
        // Rotate seed
        const newSeed = this.generateSeed();
        await this.prisma.group.update({
          where: { id: groupId },
          data: {
            currentSeed: newSeed,
            lastSeedRotatedAt: now,
          },
        });
        return newSeed;
      }
    }

    // Return current seed or generate one
    if (!group.currentSeed) {
      const newSeed = this.generateSeed();
      await this.prisma.group.update({
        where: { id: groupId },
        data: {
          currentSeed: newSeed,
          lastSeedRotatedAt: new Date(),
        },
      });
      return newSeed;
    }

    return group.currentSeed;
  }

  /**
   * Generate a deterministic random order for assets in a group using a seed.
   * Uses a hash-based shuffle that produces the same order for the same seed.
   */
  async getRandomOrderedAssetIds(params: {
    groupId: string;
    seed: string;
    page: number;
    pageSize: number;
  }): Promise<{ assetIds: string[]; total: number }> {
    // Get all asset IDs in the group
    const groupAssets = await this.prisma.groupAsset.findMany({
      where: { groupId: params.groupId },
      select: { assetId: true, rankKey: true },
    });

    const total = groupAssets.length;

    // Generate a deterministic shuffle using the seed
    const shuffled = this.deterministicShuffle(
      groupAssets.map((ga) => ga.assetId),
      params.seed,
    );

    // Paginate
    const start = (params.page - 1) * params.pageSize;
    const end = start + params.pageSize;
    const assetIds = shuffled.slice(start, end);

    return { assetIds, total };
  }

  /**
   * Generate a new seed.
   */
  private generateSeed(): string {
    const timestamp = Date.now().toString(36);
    const random = crypto.randomBytes(4).toString('hex');
    return `${timestamp}${random}`;
  }

  /**
   * Deterministic shuffle using Fisher-Yates with seeded PRNG.
   * Same seed always produces the same order.
   */
  private deterministicShuffle(array: string[], seed: string): string[] {
    const result = [...array];
    const rng = this.seededRandom(seed);

    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }

    return result;
  }

  /**
   * Simple seeded PRNG (mulberry32).
   */
  private seededRandom(seed: string): () => number {
    let h = 0;
    for (let i = 0; i < seed.length; i++) {
      h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
    }
    return function () {
      h |= 0;
      h = (h + 0x6d2b79f5) | 0;
      let t = Math.imul(h ^ (h >>> 15), 1 | h);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
}
