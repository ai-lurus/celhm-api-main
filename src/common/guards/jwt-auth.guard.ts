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

    const publicPaths = ['/health', '/docs', '/auth/login'];
    if (publicPaths.some(path => url.startsWith(path))) {
      return true;
    }

    return super.canActivate(context);
  }
}
