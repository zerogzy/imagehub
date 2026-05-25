import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { FastifyRequest } from 'fastify';

@Injectable()
export class TokenGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<FastifyRequest>();

    // Reject URL query token
    if (request.query && (request.query as any)['token']) {
      throw new ForbiddenException(
        'Token in URL query is not allowed. Use Authorization header or X-ImageHub-Token header.',
      );
    }

    // Extract token from header
    const rawToken = this.extractToken(request);
    if (!rawToken) {
      throw new UnauthorizedException('Access token is required');
    }

    // Validate token
    const tokenRecord = await this.authService.validateToken(rawToken);
    if (!tokenRecord) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Attach token info to request
    (request as any).token = tokenRecord;

    return true;
  }

  private extractToken(request: FastifyRequest): string | null {
    // Priority 1: Authorization: Bearer <token>
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string') {
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0].toLowerCase() === 'bearer') {
        return parts[1];
      }
    }

    // Priority 2: X-ImageHub-Token header
    const customHeader = request.headers['x-imagehub-token'];
    if (customHeader && typeof customHeader === 'string') {
      return customHeader;
    }

    // Priority 3: Body token (only for POST/PATCH/DELETE)
    const method = request.method.toUpperCase();
    if (['POST', 'PATCH', 'DELETE'].includes(method)) {
      const body = request.body as any;
      if (body && body.token && typeof body.token === 'string') {
        return body.token;
      }
    }

    return null;
  }
}
