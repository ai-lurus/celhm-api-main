import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const user = request.user;
    const method = request.method;
    const url = request.url;
    const ip = request.ip || request.connection.remoteAddress;
    const userAgent = request.get('User-Agent');

    const startTime = Date.now();

    // Log all requests to /auth/login for debugging
    if (url.includes('/auth/login') && method === 'POST') {
      console.log('🔍 [AUDIT INTERCEPTOR] Login request intercepted:', {
        method,
        url,
        body: request.body ? { email: request.body.email, passwordLength: request.body.password?.length } : 'no body',
        ip,
      });
    }

    return next.handle().pipe(
      tap(() => {
        const duration = Date.now() - startTime;
        
        // Log sensitive operations
        if (this.isSensitiveOperation(method, url)) {
          console.log(`[AUDIT] ${method} ${url} - User: ${user?.id || 'anonymous'} - IP: ${ip} - Duration: ${duration}ms`);
          
          // In a real implementation, you would store this in a separate audit table
          // For now, we'll just log it
          this.logAuditEvent({
            userId: user?.id,
            action: `${method} ${url}`,
            ip,
            userAgent,
            duration,
            timestamp: new Date(),
          });
        }
      }),
    );
  }

  private isSensitiveOperation(method: string, url: string): boolean {
    const sensitiveMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    const sensitivePaths = [
      '/tickets',
      '/movements',
      '/stock',
      '/auth',
      '/notify',
    ];

    return sensitiveMethods.includes(method) && 
           sensitivePaths.some(path => url.includes(path));
  }

  private logAuditEvent(event: any) {
    // TODO: Store in audit table
    console.log('Audit Event:', JSON.stringify(event, null, 2));
  }
}

