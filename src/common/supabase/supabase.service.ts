import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService implements OnModuleInit {
  private client: SupabaseClient;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const url = this.configService.get<string>('SUPABASE_URL');
    const serviceRoleKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!url || !serviceRoleKey) {
      this.logger.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set – Supabase admin features disabled');
      return;
    }

    this.client = createClient(url, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }

  /**
   * Delete a user from Supabase Auth by their auth UUID.
   * Returns true if deleted successfully, false otherwise.
   */
  async deleteAuthUser(authUserId: string): Promise<boolean> {
    if (!this.client) {
      this.logger.error('Supabase client not initialized – cannot delete auth user');
      return false;
    }

    const { error } = await this.client.auth.admin.deleteUser(authUserId);

    if (error) {
      this.logger.error(`Failed to delete Supabase auth user ${authUserId}: ${error.message}`);
      return false;
    }

    this.logger.log(`Deleted Supabase auth user ${authUserId}`);
    return true;
  }
}
