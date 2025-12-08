import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
    });
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
        // Don't connect immediately in serverless
        return;
      }
      
      await this.$connect();
      this.logger.log('✅ Database connected successfully');
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
      }
      
      // Don't throw - allow app to start even if DB is temporarily unavailable
      // The connection will be retried on first query
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

