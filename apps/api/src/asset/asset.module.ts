import { Module } from '@nestjs/common';
import { AssetController } from './asset.controller';
import { AssetService } from './asset.service';
import { StorageModule } from '../storage/storage.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [StorageModule, StatsModule],
  controllers: [AssetController],
  providers: [AssetService],
  exports: [AssetService],
})
export class AssetModule {}
