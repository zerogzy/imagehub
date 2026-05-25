import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as path from 'path';
import { AuthModule } from './auth/auth.module';
import { AssetModule } from './asset/asset.module';
import { UploadModule } from './upload/upload.module';
import { StorageModule } from './storage/storage.module';
import { DerivativeModule } from './derivative/derivative.module';
import { GroupModule } from './group/group.module';
import { TagModule } from './tag/tag.module';
import { SearchModule } from './search/search.module';
import { RandomModule } from './random/random.module';
import { DownloadModule } from './download/download.module';
import { StatsModule } from './stats/stats.module';
import { SimilarityModule } from './similarity/similarity.module';
import { TrashModule } from './trash/trash.module';
import { BackupModule } from './backup/backup.module';
import { RateLimitModule } from './rate-limit/rate-limit.module';
import { AuditLogModule } from './audit-log/audit-log.module';
import { JobModule } from './job/job.module';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { SettingModule } from './setting/setting.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [
        path.resolve(process.cwd(), '.env.local'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '../../.env.local'),
        path.resolve(process.cwd(), '../../.env'),
      ],
    }),
    PrismaModule,
    RedisModule,
    AuthModule,
    AssetModule,
    UploadModule,
    StorageModule,
    DerivativeModule,
    GroupModule,
    TagModule,
    SearchModule,
    RandomModule,
    DownloadModule,
    StatsModule,
    SimilarityModule,
    TrashModule,
    BackupModule,
    RateLimitModule,
    AuditLogModule,
    JobModule,
    SettingModule,
  ],
})
export class AppModule {}
