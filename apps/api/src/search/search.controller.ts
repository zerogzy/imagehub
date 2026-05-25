import { Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { SearchService } from './search.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller()
export class SearchController {
  constructor(private searchService: SearchService) {}

  @Get('search/global')
  @UseGuards(TokenGuard)
  async searchGlobal(
    @Query('q') q: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('mediaType') mediaType?: string,
  ) {
    const result = await this.searchService.searchGlobal({
      query: q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      mediaType,
    });
    return { success: true, ...result };
  }

  @Get('search/group')
  @UseGuards(TokenGuard)
  async searchGroup(
    @Query('groupId') groupId: string,
    @Query('q') q: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('subgroupId') subgroupId?: string,
    @Query('tag') tag?: string,
    @Query('mediaType') mediaType?: string,
  ) {
    const result = await this.searchService.searchGroup({
      groupId,
      query: q,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
      subgroupId,
      tag,
      mediaType,
    });
    return { success: true, ...result };
  }

  @Post('admin/search/reindex-all')
  @UseGuards(TokenGuard, AdminGuard)
  async reindexAll() {
    const result = await this.searchService.reindexAll();
    return { success: true, data: result };
  }
}
