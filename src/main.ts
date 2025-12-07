import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS with security
  // Detect production: Vercel sets VERCEL=1, or NODE_ENV=production
  // Default: if no CORS_ORIGINS is set, allow all vercel.app domains in production
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  const hasExplicitCorsOrigins = process.env.CORS_ORIGINS && process.env.CORS_ORIGINS.trim() !== '';
  
  const allowedOrigins = hasExplicitCorsOrigins
    ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
    : isProduction
    ? [] // Empty means we'll use pattern matching for vercel.app
    : ['http://localhost:3000', 'http://localhost:3001'];

  // Log CORS configuration for debugging
  if (!isProduction) {
    console.log('🔒 CORS Configuration:');
    console.log('  NODE_ENV:', process.env.NODE_ENV || 'not set');
    console.log('  VERCEL:', process.env.VERCEL || 'not set');
    console.log('  Is Production:', isProduction);
    console.log('  Has Explicit CORS_ORIGINS:', hasExplicitCorsOrigins);
    console.log('  Allowed Origins:', allowedOrigins.length > 0 ? allowedOrigins : 'Pattern matching (vercel.app)');
    console.log('  CORS_ORIGINS env:', process.env.CORS_ORIGINS || 'not set (using default: allow vercel.app)');
  }

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) {
        if (!isProduction) {
          console.log('✅ CORS: Allowing request with no origin');
        }
        return callback(null, true);
      }
      
      if (!isProduction) {
        console.log(`🔍 CORS: Checking origin: ${origin}`);
      }
      
      // If CORS_ORIGINS is explicitly set, use exact matching
      if (hasExplicitCorsOrigins) {
        if (allowedOrigins.includes(origin)) {
          if (!isProduction) {
            console.log(`✅ CORS: Allowing origin (exact match): ${origin}`);
          }
          callback(null, true);
        } else {
          if (!isProduction) {
            console.log(`❌ CORS: Blocking origin: ${origin}`);
            console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
          }
          callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
        }
      } else {
        // In production without explicit CORS_ORIGINS, allow any vercel.app subdomain
        if (isProduction) {
          if (origin.endsWith('.vercel.app') || origin === 'https://vercel.app') {
            if (!isProduction) {
              console.log(`✅ CORS: Allowing origin (vercel.app pattern): ${origin}`);
            }
            callback(null, true);
          } else {
            if (!isProduction) {
              console.log(`❌ CORS: Blocking origin (not vercel.app): ${origin}`);
            }
            callback(new Error(`Not allowed by CORS. Origin: ${origin}. Only vercel.app domains are allowed.`));
          }
        } else {
          // Development: use exact matching
          if (allowedOrigins.includes(origin)) {
            if (!isProduction) {
              console.log(`✅ CORS: Allowing origin: ${origin}`);
            }
            callback(null, true);
          } else {
            if (!isProduction) {
              console.log(`❌ CORS: Blocking origin: ${origin}`);
              console.log(`   Allowed origins: ${allowedOrigins.join(', ')}`);
            }
            callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
          }
        }
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger documentation
  const config = new DocumentBuilder()
    .setTitle('CELHM API')
    .setDescription('SaaS Multi-tenant para inventario por sucursal y tickets de reparación')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.API_PORT || 3001;
  await app.listen(port);
  
  console.log(`🚀 API running on http://localhost:${port}`);
  console.log(`📚 Swagger docs available at http://localhost:${port}/docs`);
}

bootstrap();
