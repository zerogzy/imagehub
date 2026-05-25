import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

/**
 * Simple token-based rate limiting using Redis.
 * Tracks request counts per token + endpoint type.
 */
@Injectable()
export class RateLimitService {
  private readonly PREFIX = 'imagehub:ratelimit';

  /** Rate limit configuration by category */
  private readonly limits: Record<string, { windowSeconds: number; maxRequests: number }> = {
    // Visitor limits
    gallery: { windowSeconds: 60, maxRequests: 120 }, // 120/min
    search: { windowSeconds: 60, maxRequests: 30 }, // 30/min
    detail: { windowSeconds: 60, maxRequests: 60 }, // 60/min
    download: { windowSeconds: 60, maxRequests: 10 }, // 10/min
    batch_download: { windowSeconds: 300, maxRequests: 3 }, // 3/5min

    // Admin limits
    upload: { windowSeconds: 60, maxRequests: 20 }, // 20/min
    batch_operation: { windowSeconds: 60, maxRequests: 10 }, // 10/min
    similarity_scan: { windowSeconds: 3600, maxRequests: 1 }, // 1/hour
    backup_export: { windowSeconds: 3600, maxRequests: 2 }, // 2/hour
  };

  constructor(private redis: RedisService) {}

  /**
   * Check if a request is within rate limits.
   * Returns true if allowed, false if rate limited.
   */
  async checkLimit(tokenId: string, category: string): Promise<{
    allowed: boolean;
    remaining: number;
    resetAt: number;
  }> {
    const limit = this.limits[category];
    if (!limit) {
      return { allowed: true, remaining: Infinity, resetAt: 0 };
    }

    const key = `${this.PREFIX}:${tokenId}:${category}`;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - (now % limit.windowSeconds);
    const resetAt = (windowStart + limit.windowSeconds) * 1000;

    const current = await this.redis.incr(key);
    if (current === 1) {
      // First request in this window, set expiry
      await this.redis.expire(key, limit.windowSeconds);
    }

    const remaining = Math.max(0, limit.maxRequests - current);
    const allowed = current <= limit.maxRequests;

    return { allowed, remaining, resetAt };
  }
}
