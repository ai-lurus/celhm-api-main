const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const { AppModule } = require('../dist/src/app.module');

let cachedApp;

async function bootstrap() {
  if (!cachedApp) {
    console.log('🚀 [BOOTSTRAP] Creating NestJS application for Vercel...');
    
    // Log environment variables status (without sensitive data)
    console.log('📋 [BOOTSTRAP] Environment check:');
    console.log('   VERCEL:', process.env.VERCEL || 'not set');
    console.log('   NODE_ENV:', process.env.NODE_ENV || 'not set');
    console.log('   DATABASE_URL:', process.env.DATABASE_URL ? '✅ configured' : '❌ NOT SET');
    if (process.env.DATABASE_URL) {
      try {
        const url = new URL(process.env.DATABASE_URL);
        console.log('   DB Host:', url.hostname);
        console.log('   DB Port:', url.port || '5432');
        console.log('   DB Database:', url.pathname.replace('/', '') || 'postgres');
      } catch (e) {
        console.log('   DB URL: ⚠️ Invalid format');
      }
    }
    console.log('   JWT_SECRET:', process.env.JWT_SECRET ? '✅ configured' : '❌ NOT SET');
    
    // Create NestJS app (it uses Express by default)
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'], // Include 'log' to see PrismaService logs
    });
    
    // Enable CORS - Allow all origins in production for now, can be restricted later
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    const hasExplicitCorsOrigins = process.env.CORS_ORIGINS && process.env.CORS_ORIGINS.trim() !== '';
    
    const allowedOrigins = hasExplicitCorsOrigins
      ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
      : isProduction
      ? [] // Empty means we'll use pattern matching
      : ['http://localhost:3000', 'http://localhost:3001'];

    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) {
          return callback(null, true);
        }
        
        if (hasExplicitCorsOrigins) {
          if (allowedOrigins.includes(origin)) {
            callback(null, true);
          } else {
            callback(new Error(`Not allowed by CORS. Origin: ${origin}`));
          }
        } else {
          // In production without explicit CORS_ORIGINS, allow vercel.app domains and common origins
          if (isProduction) {
            if (
              origin.endsWith('.vercel.app') || 
              origin === 'https://vercel.app' ||
              origin.includes('localhost') ||
              origin.includes('127.0.0.1')
            ) {
              callback(null, true);
            } else {
              // For now, allow all origins in production if no explicit config
              // TODO: Restrict this based on your frontend URL
              callback(null, true);
            }
          } else {
            if (allowedOrigins.includes(origin)) {
              callback(null, true);
            } else {
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
    
    // Configure Swagger with custom options for Vercel
    // Use CDN for Swagger UI assets to avoid static file serving issues
    SwaggerModule.setup('docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
        tryItOutEnabled: true,
      },
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'CELHM API Documentation',
      customfavIcon: '/favicon.ico',
      customJs: [
        'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-bundle.js',
        'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui-standalone-preset.js',
      ],
      customCssUrl: 'https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14/swagger-ui.css',
    });

    // Initialize the app (but don't listen - Vercel handles that)
    await app.init();
    
    cachedApp = app;
    console.log('✅ [BOOTSTRAP] Application cached and ready for Vercel');
  }
  
  return cachedApp;
}

module.exports = async (req, res) => {
  try {
    const app = await bootstrap();
    // Get the Express instance from NestJS HttpAdapter
    const expressApp = app.getHttpAdapter().getInstance();
    // Handle the request with Express
    expressApp(req, res);
  } catch (error) {
    console.error('❌ Error in Vercel handler:', error);
    console.error('Stack:', error.stack);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: 'Internal server error',
        message: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
};

