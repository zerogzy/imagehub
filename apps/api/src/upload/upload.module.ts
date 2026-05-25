import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { StorageModule } from '../storage/storage.module';
import { DerivativeModule } from '../derivative/derivative.module';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [StorageModule, DerivativeModule, SearchModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
