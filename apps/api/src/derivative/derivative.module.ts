import { Module } from '@nestjs/common';
import { DerivativeService } from './derivative.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  providers: [DerivativeService],
  exports: [DerivativeService],
})
export class DerivativeModule {}
