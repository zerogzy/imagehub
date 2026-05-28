import { Module } from '@nestjs/common';
import { GroupController } from './group.controller';
import { GroupService } from './group.service';
import { SubgroupService } from './subgroup.service';
import { GroupAssetService } from './group-asset.service';

@Module({
  controllers: [GroupController],
  providers: [GroupService, SubgroupService, GroupAssetService],
  exports: [GroupService, SubgroupService, GroupAssetService],
})
export class GroupModule {}
