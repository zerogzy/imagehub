import { Module } from '@nestjs/common';
import { SimilarityController } from './similarity.controller';
import { SimilarityService } from './similarity.service';

@Module({
  controllers: [SimilarityController],
  providers: [SimilarityService],
  exports: [SimilarityService],
})
export class SimilarityModule {}
