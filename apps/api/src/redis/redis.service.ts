import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      host: this.configService.get('REDIS_HOST', 'localhost'),
      port: this.configService.get<number>('REDIS_PORT', 6379),
      password: this.configService.get('REDIS_PASSWORD'),
      db: this.configService.get<number>('REDIS_DB', 0),
      maxRetriesPerRequest: 3,
    });

    this.redis.on('connect', () => console.log('✅ Redis connected'));
    this.redis.on('error', (err) => console.error('❌ Redis error:', err));
  }

  async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.redis.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.redis.set(key, value);
    }
  }

  async del(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }

  async incr(key: string): Promise<number> {
    return this.redis.incr(key);
  }

  async expire(key: string, ttlSeconds: number): Promise<void> {
    await this.redis.expire(key, ttlSeconds);
  }

  async lpush(key: string, ...values: string[]): Promise<number> {
    return this.redis.lpush(key, ...values);
  }

  async brpop(key: string, timeout: number): Promise<[string, string] | null> {
    return this.redis.brpop(key, timeout);
  }

  async rpop(key: string): Promise<string | null> {
    return this.redis.rpop(key);
  }

  async llen(key: string): Promise<number> {
    return this.redis.llen(key);
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    await this.redis.hset(key, field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.redis.hget(key, field);
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    return this.redis.hgetall(key);
  }

  async sadd(key: string, ...members: string[]): Promise<number> {
    return this.redis.sadd(key, ...members);
  }

  async sismember(key: string, member: string): Promise<boolean> {
    const result = await this.redis.sismember(key, member);
    return result === 1;
  }

  // Get the raw ioredis client for BullMQ and other advanced use
  getClient(): Redis {
    return this.redis;
  }

  async onModuleDestroy() {
    await this.redis.quit();
    console.log('🔌 Redis disconnected');
  }
}
