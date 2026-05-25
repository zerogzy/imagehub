import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

const SETTINGS_KEY = 'imagehub:system_settings';

const DEFAULTS: Record<string, string> = {
  sessionCacheHours: '3',
  downloadTempExpireMinutes: '5',
  downloadBatchMaxExpireMinutes: '30',
  uploadMaxConcurrent: '3',
  trashRetentionDays: '30',
  statsFlushIntervalMinutes: '5',
};

@Injectable()
export class SettingService {
  constructor(private redis: RedisService) {}

  async getAll(): Promise<Record<string, string>> {
    const stored = await this.redis.hgetall(SETTINGS_KEY);
    return { ...DEFAULTS, ...stored };
  }

  async get(key: string): Promise<string> {
    const val = await this.redis.hget(SETTINGS_KEY, key);
    return val ?? DEFAULTS[key] ?? '';
  }

  async update(data: Record<string, string>): Promise<Record<string, string>> {
    for (const [k, v] of Object.entries(data)) {
      await this.redis.hset(SETTINGS_KEY, k, v);
    }
    return this.getAll();
  }
}
