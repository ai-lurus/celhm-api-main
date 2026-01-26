
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy, 'supabase') {
    constructor(
        private authService: AuthService,
        private configService: ConfigService,
    ) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: configService.get<string>('SUPABASE_JWT_SECRET') || process.env.SUPABASE_JWT_SECRET || 'fallback_secret_to_prevent_crash',
        });

        if (!configService.get<string>('SUPABASE_JWT_SECRET') && !process.env.SUPABASE_JWT_SECRET) {
            console.warn('⚠️  WARNING: SUPABASE_JWT_SECRET is not set. Supabase Auth will not work correctly.');
        }
    }

    async validate(payload: any) {
        // Supabase JWT payload contains: sub (uuid), email, app_metadata, user_metadata, etc.
        const user = await this.authService.validateSupabaseUser(payload);

        if (!user) {
            throw new UnauthorizedException('User not found in system or email mismatch');
        }

        return user;
    }
}
