import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService, AuthUser } from './auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private authService: AuthService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'your-secret-key',
    });
  }

  async validate(payload: any): Promise<AuthUser> {
    // Log for debugging (remove in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔍 Validating JWT payload:', { sub: payload.sub, email: payload.email });
    }
    
    const user = await this.authService.validateJwtPayload(payload);
    if (!user) {
      if (process.env.NODE_ENV !== 'production') {
        console.log('❌ JWT validation failed for payload:', payload);
      }
      throw new UnauthorizedException('Invalid token');
    }
    
    if (process.env.NODE_ENV !== 'production') {
      console.log('✅ JWT validation successful for user:', user.email);
    }
    
    return user;
  }
}

