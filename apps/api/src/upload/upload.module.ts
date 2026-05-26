import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { StorageModule } from '../storage/storage.module';
import { DerivativeModule } from '../derivative/derivative.module';
import { SearchModule } from '../search/search.module';
import { GroupModule } from '../group/group.module';

@Module({
  imports: [StorageModule, DerivativeModule, SearchModule, GroupModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
