
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-custom';
import { ExtractJwt } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { AuthService } from './auth.service';

@Injectable()
export class SupabaseStrategy extends PassportStrategy(Strategy, 'supabase') {
    private supabase: SupabaseClient;

    constructor(
        private authService: AuthService,
        private configService: ConfigService,
    ) {
        super();
        const supabaseUrl = this.configService.get<string>('SUPABASE_URL') || process.env.SUPABASE_URL;
        // We use the service role key to be able to verify any token, 
        // effectively acting as the auth server's admin interface or just a privileged client.
        // Actually, for getUser(token), anon key might suffice if the token is valid, 
        // but service role is safer for backend operations if we need to inspect more.
        const supabaseKey = this.configService.get<string>('SUPABASE_SECRET_KEY') || process.env.SUPABASE_SECRET_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.error('❌ Supabase URL or Secret Key is missing in environment variables');
        }

        this.supabase = createClient(supabaseUrl || '', supabaseKey || '', {
            auth: {
                autoRefreshToken: false,
                persistSession: false,
                detectSessionInUrl: false,
            },
        });
    }

    async validate(req: any) {
        const token = ExtractJwt.fromAuthHeaderAsBearerToken()(req);

        if (!token) {
            throw new UnauthorizedException('No token provided');
        }

        try {
            const { data: { user }, error } = await this.supabase.auth.getUser(token);

            if (error || !user) {
                // console.log('❌ Invalid Supabase token:', error?.message);
                throw new UnauthorizedException('Invalid token');
            }

            // user is the Supabase user object. 
            // We need to map it to our internal user.
            const internalUser = await this.authService.validateSupabaseUser(user);

            if (!internalUser) {
                throw new UnauthorizedException('User not found in system');
            }

            return internalUser;
        } catch (error) {
            throw new UnauthorizedException('Token verification failed');
        }
    }
}
