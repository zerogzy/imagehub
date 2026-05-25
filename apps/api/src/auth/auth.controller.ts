import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { TokenGuard } from './token.guard';
import { AdminGuard } from './admin.guard';
import { FastifyRequest } from 'fastify';

@Controller()
export class AuthController {
  constructor(private authService: AuthService) {}

  @Get('me')
  @UseGuards(TokenGuard)
  async getMe(@Request() req: FastifyRequest) {
    const token = (req as any).token;
    return {
      success: true,
      data: {
        id: token.id,
        name: token.name,
        role: token.role,
        tokenPrefix: token.tokenPrefix,
      },
    };
  }

  @Get('admin/tokens')
  @UseGuards(TokenGuard, AdminGuard)
  async listTokens() {
    const tokens = await this.authService.listTokens();
    return { success: true, data: tokens };
  }

  @Post('admin/tokens')
  @UseGuards(TokenGuard, AdminGuard)
  async createToken(
    @Body() body: { name: string; role: 'visitor' | 'admin'; expiresAt?: string; rawToken?: string },
  ) {
    // 管理员角色不允许自定义 token
    if (body.rawToken && body.role === 'admin') {
      throw new BadRequestException('管理员密钥不允许自定义值');
    }
    const expiresAt = body.expiresAt ? new Date(body.expiresAt) : undefined;
    const result = await this.authService.createToken({
      name: body.name,
      role: body.role,
      expiresAt,
      rawToken: body.rawToken,
    });
    return {
      success: true,
      data: {
        id: result.id,
        tokenPrefix: result.tokenPrefix,
        rawToken: result.rawToken,
      },
      message: 'Save this token now. It will NOT be shown again.',
    };
  }

  @Get('admin/tokens/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async getToken(@Param('id') id: string) {
    const token = await this.authService.getToken(id);
    return { success: true, data: token };
  }

  @Patch('admin/tokens/:id')
  @UseGuards(TokenGuard, AdminGuard)
  async updateToken(
    @Param('id') id: string,
    @Body() body: { name?: string; enabled?: boolean; expiresAt?: string | null },
  ) {
    try {
      const data: any = {};
      if (body.name !== undefined) data.name = body.name;
      if (body.enabled !== undefined) data.enabled = body.enabled;
      if (body.expiresAt !== undefined) {
        data.expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;
      }
      const token = await this.authService.updateToken(id, data);
      return { success: true, data: token };
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw err;
    }
  }

  @Delete('admin/tokens/:id')
  @UseGuards(TokenGuard, AdminGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteToken(@Param('id') id: string) {
    try {
      await this.authService.deleteToken(id);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw err;
    }
  }

  @Post('admin/tokens/:id/rotate')
  @UseGuards(TokenGuard, AdminGuard)
  async rotateToken(@Param('id') id: string) {
    const result = await this.authService.rotateToken(id);
    if (!result) {
      return { success: false, error: { code: 'NOT_FOUND', message: 'Token not found' } };
    }
    return {
      success: true,
      data: {
        id: result.id,
        tokenPrefix: result.tokenPrefix,
        rawToken: result.rawToken,
      },
      message: 'Token rotated. Save the new token now. The old token has been disabled.',
    };
  }
}
