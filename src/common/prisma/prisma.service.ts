import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Ensure we use direct connection for Prisma (not pooler)
    // Prisma doesn't work well with pgbouncer transaction pooler
    let databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      throw new Error('DATABASE_URL environment variable is required');
    }
    
    // If URL contains pgbouncer=true, remove it and use direct connection
    if (databaseUrl.includes('pgbouncer=true')) {
      databaseUrl = databaseUrl
        .replace(':6543/', ':5432/') // Change port from pooler to direct
        .replace('?pgbouncer=true&', '?')
        .replace('&pgbouncer=true', '')
        .replace('?pgbouncer=true', '');
    }
    
    // Ensure sslmode=require is present for Supabase
    if (!databaseUrl.includes('sslmode=')) {
      databaseUrl += (databaseUrl.includes('?') ? '&' : '?') + 'sslmode=require';
    }
    
    // Call super first (required by TypeScript)
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    
    // Now we can use this.logger
    // Log connection details (without password)
    try {
      const url = new URL(databaseUrl);
      this.logger.log(`🔌 Prisma will connect to: ${url.hostname}:${url.port || '5432'}`);
    } catch (e) {
      this.logger.error('❌ Invalid DATABASE_URL format');
    }
  }

  async onModuleInit() {
    try {
      // Validate DATABASE_URL is configured
      if (!process.env.DATABASE_URL) {
        this.logger.error('❌ DATABASE_URL is not configured in environment variables');
        this.logger.error('Please set DATABASE_URL in your .env file');
        // Don't throw - allow app to start, connection will fail on first query with better error
        return;
      }

      // Log connection info (without sensitive data)
      const dbUrl = process.env.DATABASE_URL;
      const urlObj = new URL(dbUrl);
      this.logger.log(`🔌 Connecting to database: ${urlObj.hostname}:${urlObj.port || '5432'}`);
      
      // In serverless environments (Vercel), we use lazy connection
      // The connection will be established on first query
      // This avoids connection issues during cold starts
      if (process.env.VERCEL) {
        this.logger.log('⚠️ Running on Vercel - using lazy connection');
        this.logger.log('   Connection will be established on first query');
        // Don't connect immediately in serverless - Prisma will connect on first query
        return;
      }
      
      // For non-serverless, connect immediately
      try {
        await this.$connect();
        this.logger.log('✅ Database connected successfully');
      } catch (connectError: any) {
        this.logger.warn('⚠️ Initial connection failed, will retry on first query');
        this.logger.warn(`   Error: ${connectError.message}`);
        // Don't throw - Prisma will retry on first query
      }
    } catch (error: any) {
      const dbUrl = process.env.DATABASE_URL;
      const urlInfo = dbUrl ? (() => {
        try {
          const url = new URL(dbUrl);
          return `${url.hostname}:${url.port || '5432'}`;
        } catch {
          return 'invalid URL format';
        }
      })() : 'not configured';
      
      this.logger.error('❌ Failed to connect to database');
      this.logger.error(`   Host: ${urlInfo}`);
      this.logger.error(`   Error: ${error.message}`);
      
      if (error.code === 'ECONNREFUSED') {
        this.logger.error('   💡 The database server is not reachable. Check:');
        this.logger.error('      - Is the database server running?');
        this.logger.error('      - Is the hostname and port correct?');
        this.logger.error('      - Are there firewall/network restrictions?');
      } else if (error.code === 'ENOTFOUND') {
        this.logger.error('   💡 DNS resolution failed. Check:');
        this.logger.error('      - Is the hostname correct?');
        this.logger.error('      - Is your network connection working?');
      } else if (error.message?.includes('authentication')) {
        this.logger.error('   💡 Authentication failed. Check:');
        this.logger.error('      - Are the database credentials correct?');
        this.logger.error('      - Is the user allowed to connect from this IP?');
      } else if (error.message?.includes('Can\'t reach database server')) {
        this.logger.error('   💡 Cannot reach database server. Check:');
        this.logger.error('      - Is the hostname correct? (db.xxx.supabase.co)');
        this.logger.error('      - Is the port correct? (5432 for direct connection)');
        this.logger.error('      - Are you using Direct connection in Supabase?');
        this.logger.error('      - Check Supabase Dashboard > Settings > Database > Connection string');
      }
      
      // Don't throw - allow app to start even if DB is temporarily unavailable
      // The connection will be retried on first query
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

