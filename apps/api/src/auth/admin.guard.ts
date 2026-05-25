import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { FastifyRequest } from 'fastify';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FastifyRequest>();
    const token = (request as any).token;

    if (!token || token.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
