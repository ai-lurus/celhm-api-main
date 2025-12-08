const { NestFactory } = require('@nestjs/core');
const { ValidationPipe } = require('@nestjs/common');
const { SwaggerModule, DocumentBuilder } = require('@nestjs/swagger');
const { AppModule } = require('../dist/src/app.module');

let cachedApp;

async function bootstrap() {
  if (!cachedApp) {
    console.log('🚀 [BOOTSTRAP] Creating NestJS application...');
    const app = await NestFactory.create(AppModule);
    console.log('✅ [BOOTSTRAP] NestJS application created');
    
    // Enable CORS
    const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
    const hasExplicitCorsOrigins = process.env.CORS_ORIGINS && process.env.CORS_ORIGINS.trim() !== '';
    
    const allowedOrigins = hasExplicitCorsOrigins
      ? process.env.CORS_ORIGINS.split(',').map(origin => origin.trim())
      : isProduction
      ? []
      : ['http://localhost:3000', 'http://localhost:3001'];

    app.enableCors({
      origin: (origin, callback) => {
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
          if (isProduction) {
            if (origin.endsWith('.vercel.app') || origin === 'https://vercel.app') {
              callback(null, true);
            } else {
              callback(new Error(`Not allowed by CORS. Origin: ${origin}. Only vercel.app domains are allowed.`));
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
    SwaggerModule.setup('docs', app, document);

    cachedApp = app;
    console.log('✅ [BOOTSTRAP] Application cached and ready');
  }
  
  return cachedApp;
}

module.exports = async (req, res) => {
  try {
    const app = await bootstrap();
    // Get the Express instance from NestJS
    const expressApp = app.getHttpAdapter().getInstance();
    // Handle the request
    expressApp(req, res);
  } catch (error) {
    console.error('❌ Error in Vercel handler:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
};

