import { Module, Global } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenGuard } from './token.guard';
import { AdminGuard } from './admin.guard';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, TokenGuard, AdminGuard],
  exports: [AuthService, TokenGuard, AdminGuard],
})
export class AuthModule {}
