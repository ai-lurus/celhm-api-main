import { Module } from '@nestjs/common';

import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

import { SupabaseStrategy } from './supabase.strategy';

@Module({
  imports: [
    PassportModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    SupabaseStrategy,
  ],
  exports: [AuthService],
})
export class AuthModule { }

