import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    // Vercel is IPv4-only, so we need to use Session Pooler (port 6543) instead of Direct Connection (port 5432)
    // Session Pooler works with Prisma, Transaction Pooler does not
    let databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('❌ DATABASE_URL environment variable is not set!');
      console.error('   Please configure DATABASE_URL in Vercel Dashboard > Settings > Environment Variables');
      throw new Error('DATABASE_URL environment variable is required');
    }
    
    // Log that we have a DATABASE_URL (for debugging in Vercel)
    console.log('✅ DATABASE_URL is configured');
    
    // If running on Vercel (IPv4-only), use Session Pooler
    // Session Pooler uses hostname aws-1-us-east-2.pooler.supabase.com with port 5432
    if (process.env.VERCEL) {
      console.log('🌐 Running on Vercel (IPv4-only) - using Session Pooler');
      
      // Check if already using pooler hostname
      const isUsingPooler = databaseUrl.includes('pooler.supabase.com');
      
      if (!isUsingPooler) {
        // Convert direct connection (db.xxx.supabase.co) to Session Pooler
        // Replace hostname with pooler hostname
        databaseUrl = databaseUrl.replace(
          /@db\.([^.]+)\.supabase\.co:/,
          '@aws-1-us-east-2.pooler.supabase.com:'
        );
        console.log('   Converted to Session Pooler hostname');
      }
      
      // Ensure port is 5432 (Session Pooler uses 5432, not 6543)
      if (databaseUrl.includes(':6543/')) {
        databaseUrl = databaseUrl.replace(':6543/', ':5432/');
        console.log('   Using port 5432 for Session Pooler');
      }
      
      // Ensure pool_mode=session is present (required for Prisma compatibility)
      if (!databaseUrl.includes('pool_mode=')) {
        databaseUrl += (databaseUrl.includes('?') ? '&' : '?') + 'pool_mode=session';
        console.log('   Added pool_mode=session');
      }
      
      console.log('   Using Session Pooler mode (compatible with Prisma and IPv4)');
    } else {
      // For local development, use direct connection if not already using pooler
      // If URL contains pooler hostname, convert to direct connection
      if (databaseUrl.includes('pooler.supabase.com')) {
        console.log('🔄 Converting from pooler to direct connection for local development');
        // Extract project ref from the pooler URL or use the original
        // For now, we'll keep the pooler URL but this shouldn't happen in local dev
        console.warn('   ⚠️ Using pooler URL in local development - consider using direct connection');
      }
    }
    
    // Ensure sslmode=require is present for Supabase
    if (!databaseUrl.includes('sslmode=')) {
      databaseUrl += (databaseUrl.includes('?') ? '&' : '?') + 'sslmode=require';
      console.log('✅ Added sslmode=require to DATABASE_URL');
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
      this.logger.log(`   Database: ${url.pathname.replace('/', '') || 'postgres'}`);
      this.logger.log(`   SSL Mode: ${url.searchParams.get('sslmode') || 'not set'}`);
      
      // Check if running on Vercel
      if (process.env.VERCEL) {
        this.logger.log('   Environment: Vercel (serverless, using Session Pooler)');
      }
    } catch (e) {
      this.logger.error('❌ Invalid DATABASE_URL format');
      this.logger.error(`   Error: ${(e as Error).message}`);
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

