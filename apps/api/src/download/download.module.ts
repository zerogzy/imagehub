import { Module } from '@nestjs/common';
import { DownloadController } from './download.controller';
import { DownloadService } from './download.service';
import { StorageModule } from '../storage/storage.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [StorageModule, StatsModule],
  controllers: [DownloadController],
  providers: [DownloadService],
  exports: [DownloadService],
})
export class DownloadModule {}
