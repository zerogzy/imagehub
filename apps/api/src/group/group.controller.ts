import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { GroupService } from './group.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller()
export class GroupController {
  constructor(private groupService: GroupService) {}

  // ---- Visitor endpoints ----

  @Get('groups')
  @UseGuards(TokenGuard)
  async listGroups() {
    const groups = await this.groupService.listGroups();
    return { success: true, data: groups };
  }

  @Get('groups/:id')
  @UseGuards(TokenGuard)
  async getGroup(@Param('id') id: string) {
    const group = await this.groupService.getGroup(id);
    if (!group) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Group not found' } };
    }
    return { success: true, data: group };
  }

  @Get('groups/:id/subgroups')
  @UseGuards(TokenGuard)
  async listSubgroups(@Param('id') id: string) {
    const subgroups = await this.groupService.listSubgroups(id);
    return { success: true, data: subgroups };
  }

  // ---- Admin endpoints ----

  @Post('admin/groups')
  @UseGuards(TokenGuard, AdminGuard)
  async createGroup(
    @Body() body: { name: string; slug: string; description?: string | null; randomEnabled?: boolean; randomRotateInterval?: number },
  ) {
    const group = await this.groupService.createGroup(body);
    return { success: true, data: group };
  }

  @Patch('admin/groups/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async updateGroup(
    @Param('id') id: string,
    @Body() body: { name?: string; slug?: string; description?: string | null; randomEnabled?: boolean; randomRotateInterval?: number },
  ) {
    const group = await this.groupService.updateGroup(id, body);
    return { success: true, data: group };
  }

  @Delete('admin/groups/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async deleteGroup(@Param('id') id: string) {
    await this.groupService.deleteGroup(id);
    return { success: true };
  }

  @Post('admin/groups/reorder')
  @UseGuards(TokenGuard, AdminGuard)
  async reorderGroups(@Body() body: { orderedIds: string[] }) {
    const groups = await this.groupService.reorderGroups(body.orderedIds);
    return { success: true, data: groups };
  }

  // ---- Subgroup admin endpoints ----

  @Post('admin/subgroups')
  @UseGuards(TokenGuard, AdminGuard)
  async createSubgroup(
    @Body() body: { groupId: string; name: string; description?: string },
  ) {
    const subgroup = await this.groupService.createSubgroup(body);
    return { success: true, data: subgroup };
  }

  @Patch('admin/subgroups/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async updateSubgroup(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
  ) {
    const subgroup = await this.groupService.updateSubgroup(id, body);
    return { success: true, data: subgroup };
  }

  @Delete('admin/subgroups/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async deleteSubgroup(@Param('id') id: string) {
    await this.groupService.deleteSubgroup(id);
    return { success: true };
  }

  @Post('admin/subgroups/reorder')
  @UseGuards(TokenGuard, AdminGuard)
  async reorderSubgroups(@Body() body: { orderedIds: string[] }) {
    const subgroups = await this.groupService.reorderSubgroups(body.orderedIds);
    return { success: true, data: subgroups };
  }

  @Post('admin/assets/move-to-group')
  @UseGuards(TokenGuard, AdminGuard)
  async moveAssetsToGroup(
    @Body() body: { assetIds: string[]; groupId: string; subgroupId?: string },
  ) {
    const results = await this.groupService.batchMoveAssetsToGroup(body);
    return { success: true, data: results };
  }

  @Post('admin/groups/:id/assets/reorder')
  @UseGuards(TokenGuard, AdminGuard)
  async moveGroupAssetRank(
    @Param('id') id: string,
    @Body() body: { assetId: string; subgroupId?: string | null; beforeAssetId?: string | null; afterAssetId?: string | null },
  ) {
    const result = await this.groupService.moveGroupAssetRank({
      groupId: id,
      assetId: body.assetId,
      subgroupId: body.subgroupId,
      beforeAssetId: body.beforeAssetId,
      afterAssetId: body.afterAssetId,
    });
    return { success: true, data: result };
  }
}
