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

    let status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: any =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Handle Express PayloadTooLargeError
    if (exception && typeof exception === 'object' && 'name' in exception && (exception as any).name === 'PayloadTooLargeError') {
      status = HttpStatus.PAYLOAD_TOO_LARGE;
      message = 'La imagen o el archivo es demasiado grande. Por favor, sube un archivo de menor tamaño.';
    }

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

