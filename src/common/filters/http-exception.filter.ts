import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Log all exceptions for debugging
    const errorDetails: any = {
      status,
      message,
      path: request.url,
      method: request.method,
      body: request.body,
      timestamp: new Date().toISOString(),
    };

    // Add error details if available
    if (exception instanceof Error) {
      errorDetails.errorMessage = exception.message;
      errorDetails.errorName = exception.name;
      if (exception.stack) {
        errorDetails.errorStack = exception.stack;
      }
    }

    // Log Prisma errors with more details
    if (exception && typeof exception === 'object' && 'code' in exception) {
      errorDetails.prismaCode = (exception as any).code;
      errorDetails.prismaMeta = (exception as any).meta;
    }

    console.error('❌ [EXCEPTION FILTER] Error caught:', JSON.stringify(errorDetails, null, 2));

    // In production, don't expose stack traces
    const isDevelopment = process.env.NODE_ENV !== 'production' && process.env.VERCEL !== '1';
    
    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message,
      ...(isDevelopment && exception instanceof Error ? {
        error: exception.message,
        stack: exception.stack,
      } : {}),
    });
  }
}

