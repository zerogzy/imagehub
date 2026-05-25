import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { JobProcessor } from './job.processor';
import { PrismaModule } from '../prisma/prisma.module';
import { StorageModule } from '../storage/storage.module';
import { StatsModule } from '../stats/stats.module';
import { RedisModule } from '../redis/redis.module';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [RedisModule],
      useFactory: (redisModule: any) => ({
        connection: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379', 10),
          password: process.env.REDIS_PASSWORD,
        },
      }),
      inject: [],
    }),
    BullModule.registerQueue({
      name: 'imagehub-jobs',
    }),
    PrismaModule,
    StorageModule,
    StatsModule,
  ],
  controllers: [JobController],
  providers: [JobService, JobProcessor],
  exports: [JobService],
})
export class JobModule {}
