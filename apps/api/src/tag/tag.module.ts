import { Module } from '@nestjs/common';
import { TagController } from './tag.controller';
import { TagService } from './tag.service';
import { SearchModule } from '../search/search.module';

@Module({
  imports: [SearchModule],
  controllers: [TagController],
  providers: [TagService],
  exports: [TagService],
})
export class TagModule {}
