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
import { TagService } from './tag.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller()
export class TagController {
  constructor(private tagService: TagService) {}

  @Get('tags')
  @UseGuards(TokenGuard)
  async listTags() {
    const tags = await this.tagService.listTags();
    return { success: true, data: tags };
  }

  @Post('admin/tags')
  @UseGuards(TokenGuard, AdminGuard)
  async createTag(@Body() body: { name: string; aliases?: string[] }) {
    const tag = await this.tagService.createTag(body);
    return { success: true, data: tag };
  }

  @Patch('admin/tags/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async updateTag(
    @Param('id') id: string,
    @Body() body: { name?: string; aliases?: string[] },
  ) {
    const tag = await this.tagService.updateTag(id, body);
    return { success: true, data: tag };
  }

  @Delete('admin/tags/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async deleteTag(@Param('id') id: string) {
    await this.tagService.deleteTag(id);
    return { success: true };
  }

  @Post('admin/assets/batch/tag')
  @UseGuards(TokenGuard, AdminGuard)
  async batchTag(@Body() body: { assetIds: string[]; tagId?: string; names?: string[]; source?: string }) {
    const results = body.names?.length
      ? await this.tagService.batchTagAssetsByNames({
          assetIds: body.assetIds,
          names: body.names,
          source: body.source,
        })
      : await this.tagService.batchTagAssets({
          assetIds: body.assetIds,
          tagId: body.tagId!,
          source: body.source,
        });
    return { success: true, data: results };
  }

  @Post('admin/assets/batch/untag')
  @UseGuards(TokenGuard, AdminGuard)
  async batchUntag(@Body() body: { assetIds: string[]; tagId: string }) {
    const results = await this.tagService.batchUntagAssets(body.assetIds, body.tagId);
    return { success: true, data: results };
  }
}
