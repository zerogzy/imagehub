import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class StatsService {
  private readonly EVENT_QUEUE_KEY = 'imagehub:stats:events';

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  /**
   * Enqueue an access event (async, non-blocking).
   */
  async enqueueEvent(event: {
    assetId: string;
    eventType: string;
    tokenId?: string;
    shareId?: string;
    ipHash?: string;
    userAgentHash?: string;
    referer?: string;
  }) {
    await this.redis.lpush(this.EVENT_QUEUE_KEY, JSON.stringify(event));
  }

  async recordEvent(event: {
    assetId: string;
    eventType: string;
    tokenId?: string;
    shareId?: string;
    ipHash?: string;
    userAgentHash?: string;
    referer?: string;
  }) {
    await this.prisma.accessEvent.create({ data: event });
  }

  /**
   * Flush queued events to MySQL.
   * Called periodically by a cron job.
   */
  async flushEvents() {
    const events: string[] = [];
    let eventStr = await this.redis.rpop(this.EVENT_QUEUE_KEY);

    while (eventStr) {
      events.push(eventStr);
      if (events.length >= 100) break; // Batch size limit
      eventStr = await this.redis.rpop(this.EVENT_QUEUE_KEY);
    }

    if (events.length === 0) return;

    // Write to MySQL
    await this.prisma.accessEvent.createMany({
      data: events.map((e) => JSON.parse(e)),
    });
  }

  /**
   * Aggregate daily stats.
   * Called periodically by a cron job.
   */
  async aggregateDailyStats(date?: Date) {
    const targetDate = date || new Date();
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Get all events for the day, grouped by asset
    const events = await this.prisma.accessEvent.findMany({
      where: {
        createdAt: { gte: startOfDay, lte: endOfDay },
      },
      select: {
        assetId: true,
        eventType: true,
        ipHash: true,
      },
    });

    // Aggregate by asset
    const assetMap = new Map<
      string,
      {
        detailViewCount: number;
        downloadCount: number;
        uniqueIps: Set<string>;
      }
    >();

    for (const event of events) {
      if (!assetMap.has(event.assetId)) {
        assetMap.set(event.assetId, {
          detailViewCount: 0,
          downloadCount: 0,
          uniqueIps: new Set(),
        });
      }
      const stats = assetMap.get(event.assetId)!;
      if (event.ipHash) stats.uniqueIps.add(event.ipHash);
      if (event.eventType === 'detail_view' || event.eventType === 'api_detail') {
        stats.detailViewCount++;
      }
      if (event.eventType === 'download' || event.eventType === 'batch_download' || event.eventType === 'permanent_share_download') {
        stats.downloadCount++;
      }
    }

    // Upsert daily stats
    for (const [assetId, stats] of assetMap) {
      await this.prisma.assetStatsDaily.upsert({
        where: {
          assetId_date: { assetId, date: startOfDay },
        },
        create: {
          assetId,
          date: startOfDay,
          detailViewCount: stats.detailViewCount,
          downloadCount: stats.downloadCount,
          uniqueIpCount: stats.uniqueIps.size,
        },
        update: {
          detailViewCount: stats.detailViewCount,
          downloadCount: stats.downloadCount,
          uniqueIpCount: stats.uniqueIps.size,
        },
      });
    }
  }

  /**
   * Get stats overview.
   */
  async getOverview() {
    const [totalAssets, totalViews, totalDownloads, totalTokens] =
      await Promise.all([
        this.prisma.mediaAsset.count({ where: { status: 'ready' } }),
        this.prisma.accessEvent.count({
          where: { eventType: { in: ['detail_view', 'api_detail'] } },
        }),
        this.prisma.accessEvent.count({
          where: { eventType: { in: ['download', 'batch_download', 'permanent_share_download'] } },
        }),
        this.prisma.accessToken.count(),
      ]);

    return {
      totalAssets,
      totalViews,
      totalDownloads,
      totalTokens,
    };
  }

  async getAssetSummary(assetId: string) {
    const [viewCount, downloadCount, uniqueVisitors] = await Promise.all([
      this.prisma.accessEvent.count({
        where: { assetId, eventType: { in: ['detail_view', 'api_detail'] } },
      }),
      this.prisma.accessEvent.count({
        where: { assetId, eventType: { in: ['download', 'batch_download', 'permanent_share_download'] } },
      }),
      this.prisma.accessEvent.groupBy({
        by: ['ipHash'],
        where: { assetId, ipHash: { not: null } },
      }),
    ]);

    return {
      viewCount,
      downloadCount,
      uniqueVisitorCount: uniqueVisitors.length,
    };
  }

  async clearAccessStats() {
    await this.prisma.$transaction([
      this.prisma.accessEvent.deleteMany({}),
      this.prisma.assetStatsDaily.deleteMany({}),
    ]);
    return { cleared: true };
  }

  /**
   * Get top viewed assets.
   */
  async getTopViewed(limit = 100) {
    return this.prisma.assetStatsDaily.groupBy({
      by: ['assetId'],
      _sum: { detailViewCount: true },
      orderBy: { _sum: { detailViewCount: 'desc' } },
      take: limit,
    });
  }

  /**
   * Get top downloaded assets.
   */
  async getTopDownloaded(limit = 100) {
    return this.prisma.assetStatsDaily.groupBy({
      by: ['assetId'],
      _sum: { downloadCount: true },
      orderBy: { _sum: { downloadCount: 'desc' } },
      take: limit,
    });
  }
}
