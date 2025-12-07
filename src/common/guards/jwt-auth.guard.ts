import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest();
    const url = request.url;

    // Allow public endpoints (login, health check, etc.)
    const publicPaths = ['/auth/login', '/health', '/docs'];
    const isPublicPath = publicPaths.some(path => url.startsWith(path));

    if (isPublicPath) {
      console.log('🔓 [JWT GUARD] Allowing public endpoint:', url);
      return true;
    }

    // For protected endpoints, require JWT
    return super.canActivate(context);
  }
}

