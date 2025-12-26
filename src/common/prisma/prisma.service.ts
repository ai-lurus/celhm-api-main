import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly databaseUrl: string;

  constructor() {
    // Process DATABASE_URL before calling super()
    let databaseUrl = process.env.DATABASE_URL;
    
    if (!databaseUrl) {
      console.error('❌ DATABASE_URL environment variable is not set!');
      console.error('   Please configure DATABASE_URL in your environment variables');
      throw new Error('DATABASE_URL environment variable is required');
    }
    
    // Log that we have a DATABASE_URL (for debugging)
    console.log('✅ DATABASE_URL is configured');
    
    // Determine if we're in production
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    
    if (isProduction) {
      // Production: Use Transaction Pooler (port 6543 with pgbouncer=true)
      console.log('🌐 Running in production - using Transaction Pooler');
      
      try {
        const url = new URL(databaseUrl);
        
        // Convert direct connection to transaction pooler
        if (url.hostname.includes('db.') && url.hostname.includes('.supabase.co')) {
          // Extract project ref from direct connection hostname
          const projectRef = url.hostname.match(/db\.([^.]+)\.supabase\.co/)?.[1];
          if (projectRef) {
            // Convert to pooler hostname (adjust region if needed)
            url.hostname = `aws-1-us-east-2.pooler.supabase.com`;
            console.log(`   Converted direct connection to pooler hostname`);
          }
        } else if (!url.hostname.includes('pooler.supabase.com')) {
          // If not already using pooler, assume we need to use pooler
          // Keep the hostname but we'll ensure port 6543
          console.log('   Using existing hostname with pooler');
        }
        
        // Ensure port is 6543 for transaction pooler
        if (url.port !== '6543') {
          url.port = '6543';
          console.log('   Using port 6543 for Transaction Pooler');
        }
        
        // Ensure pgbouncer=true is present (required for transaction pooler)
        url.searchParams.set('pgbouncer', 'true');
        console.log('   Added pgbouncer=true for Transaction Pooler');
        
        // Remove pool_mode if present (transaction pooler doesn't use it)
        url.searchParams.delete('pool_mode');
        
        databaseUrl = url.toString();
        console.log('   Using Transaction Pooler mode (port 6543)');
      } catch (e) {
        console.warn('   ⚠️ Could not parse DATABASE_URL, using as-is');
      }
    } else {
      // Local development: Use Direct Connection (port 5432, no pooler)
      console.log('💻 Running in local development - using Direct Connection');
      
      try {
        const url = new URL(databaseUrl);
        
        // Convert pooler connection to direct connection
        if (url.hostname.includes('pooler.supabase.com')) {
          // Try to extract project ref from the URL or use a pattern
          // For Supabase, direct connection format is: db.{project-ref}.supabase.co
          // We'll need to extract this from the pooler URL or use environment variable
          const projectRef = process.env.SUPABASE_PROJECT_REF;
          
          if (projectRef) {
            url.hostname = `db.${projectRef}.supabase.co`;
            console.log(`   Converted pooler to direct connection using project ref: ${projectRef}`);
          } else {
            // If we can't determine project ref, try to infer from pooler hostname
            // Most Supabase projects use aws-1-us-east-2, but the project ref is different
            console.warn('   ⚠️ SUPABASE_PROJECT_REF not set - cannot convert pooler to direct connection');
            console.warn('   Please set SUPABASE_PROJECT_REF in .env or use direct connection URL in DATABASE_URL');
            console.warn('   Using pooler URL for local dev (not recommended)');
          }
        }
        
        // Ensure port is 5432 for direct connection
        if (url.port && url.port !== '5432') {
          url.port = '5432';
          console.log('   Using port 5432 for Direct Connection');
        }
        
        // Remove pooler-specific parameters
        url.searchParams.delete('pgbouncer');
        url.searchParams.delete('pool_mode');
        
        databaseUrl = url.toString();
        console.log('   Using Direct Connection mode (port 5432, no pooler)');
      } catch (e) {
        console.warn('   ⚠️ Could not parse DATABASE_URL, using as-is');
      }
    }
    
    // Ensure sslmode=require is present for Supabase
    try {
      const url = new URL(databaseUrl);
      if (!url.searchParams.has('sslmode')) {
        url.searchParams.set('sslmode', 'require');
        databaseUrl = url.toString();
        console.log('✅ Added sslmode=require to DATABASE_URL');
      }
    } catch (e) {
      // If URL parsing fails, try string manipulation
      if (!databaseUrl.includes('sslmode=')) {
        databaseUrl += (databaseUrl.includes('?') ? '&' : '?') + 'sslmode=require';
        console.log('✅ Added sslmode=require to DATABASE_URL');
      }
    }
    
    // Call super() first (required by TypeScript when class has initialized properties)
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
    
    // Now assign to property after super() call
    this.databaseUrl = databaseUrl;
    
    // Now we can use this.logger
    // Log connection details (without password)
    try {
      const url = new URL(databaseUrl);
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
      const connectionType = isProduction ? 'Transaction Pooler' : 'Direct Connection';
      
      this.logger.log(`🔌 Prisma will connect to: ${url.hostname}:${url.port || '5432'}`);
      this.logger.log(`   Database: ${url.pathname.replace('/', '') || 'postgres'}`);
      this.logger.log(`   Connection Type: ${connectionType}`);
      this.logger.log(`   SSL Mode: ${url.searchParams.get('sslmode') || 'not set'}`);
      
      if (isProduction) {
        this.logger.log('   Environment: Production (using Transaction Pooler on port 6543)');
      } else {
        this.logger.log('   Environment: Local Development (using Direct Connection on port 5432)');
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
      const urlObj = new URL(this.databaseUrl);
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
      const connectionType = isProduction ? 'Transaction Pooler' : 'Direct Connection';
      
      this.logger.log(`🔌 Connecting to database: ${urlObj.hostname}:${urlObj.port || '5432'}`);
      this.logger.log(`   Connection Type: ${connectionType}`);
      
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
      const urlInfo = this.databaseUrl ? (() => {
        try {
          const url = new URL(this.databaseUrl);
          return `${url.hostname}:${url.port || '5432'}`;
        } catch {
          return 'invalid URL format';
        }
      })() : 'not configured';
      
      const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
      const expectedPort = isProduction ? '6543 (Transaction Pooler)' : '5432 (Direct Connection)';
      
      this.logger.error('❌ Failed to connect to database');
      this.logger.error(`   Host: ${urlInfo}`);
      this.logger.error(`   Error: ${error.message}`);
      
      if (error.code === 'ECONNREFUSED') {
        this.logger.error('   💡 The database server is not reachable. Check:');
        this.logger.error('      - Is the database server running?');
        this.logger.error(`      - Is the port correct? (Expected: ${expectedPort})`);
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
        if (isProduction) {
          this.logger.error('      - Is the hostname correct? (pooler.supabase.com)');
          this.logger.error('      - Is the port correct? (6543 for Transaction Pooler)');
          this.logger.error('      - Is pgbouncer=true in the connection string?');
        } else {
          this.logger.error('      - Is the hostname correct? (db.xxx.supabase.co)');
          this.logger.error('      - Is the port correct? (5432 for Direct Connection)');
          this.logger.error('      - Are you using Direct connection in Supabase?');
        }
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

