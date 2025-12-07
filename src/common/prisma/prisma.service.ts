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
      this.logger.error('❌ Failed to connect to database:', error.message);
      this.logger.debug('DATABASE_URL configured:', !!process.env.DATABASE_URL);
      // Don't throw - allow app to start even if DB is temporarily unavailable
      // The connection will be retried on first query
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}

