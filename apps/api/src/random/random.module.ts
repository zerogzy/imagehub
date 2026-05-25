import { Module } from '@nestjs/common';
import { RandomController } from './random.controller';
import { RandomService } from './random.service';

@Module({
  controllers: [RandomController],
  providers: [RandomService],
  exports: [RandomService],
})
export class RandomModule {}
