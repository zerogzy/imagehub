import {
  Controller,
  Get,
  Put,
  Body,
  UseGuards,
} from '@nestjs/common';
import { SettingService } from './setting.service';
import { TokenGuard } from '../auth/token.guard';
import { AdminGuard } from '../auth/admin.guard';

@Controller()
export class SettingController {
  constructor(private settingService: SettingService) {}

  @Get('settings/public')
  async getPublic() {
    const hours = await this.settingService.get('sessionCacheHours');
    return { success: true, data: { sessionCacheHours: parseInt(hours, 10) || 3 } };
  }

  @Get('admin/settings')
  @UseGuards(TokenGuard, AdminGuard)
  async getAll() {
    const data = await this.settingService.getAll();
    return { success: true, data };
  }

  @Put('admin/settings')
  @UseGuards(TokenGuard, AdminGuard)
  async update(@Body() body: Record<string, string>) {
    const data = await this.settingService.update(body);
    return { success: true, data };
  }
}
