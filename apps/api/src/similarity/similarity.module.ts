import { Module } from '@nestjs/common';
import { SimilarityController } from './similarity.controller';
import { SimilarityService } from './similarity.service';
import { WorkerSimilarityController } from '../worker/worker-similarity.controller';

@Module({
  controllers: [SimilarityController, WorkerSimilarityController],
  providers: [SimilarityService],
  exports: [SimilarityService],
})
export class SimilarityModule {}
