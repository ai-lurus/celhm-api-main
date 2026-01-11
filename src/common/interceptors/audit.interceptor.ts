import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) { }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const method = request.method;
    const url = request.url;
    const ip = request.ip || request.connection?.remoteAddress;
    const userAgent = request.get('User-Agent');

    const startTime = Date.now();

    return next.handle().pipe(
      tap(async () => {
        const duration = Date.now() - startTime;

        // Log sensitive operations
        if (this.isSensitiveOperation(method, url)) {
          // Async logging to not block response
          this.logAuditEvent({
            userId: user?.id,
            organizationId: user?.organizationId,
            branchId: user?.branchId,
            action: method, // e.g., POST
            entityName: this.extractEntityName(url),
            entityId: this.extractEntityId(url),
            metadata: {
              url,
              ip,
              userAgent,
              duration,
              body: ['POST', 'PUT', 'PATCH'].includes(method) ? request.body : undefined
            },
          }).catch(err => console.error('Failed to log audit event', err));
        }
      }),
    );
  }

  private isSensitiveOperation(method: string, url: string): boolean {
    const sensitiveMethods = ['POST', 'PUT', 'PATCH', 'DELETE'];
    // Filter out login/auth from body logging if needed, or handle in metadata
    const sensitivePaths = [
      '/tickets',
      '/movements',
      '/stock',
      '/auth',
      '/notify',
      '/sales',
      '/customers'
    ];

    return sensitiveMethods.includes(method) &&
      sensitivePaths.some(path => url.includes(path));
  }

  private extractEntityName(url: string): string {
    const parts = url.split('/').filter(p => p);
    return parts[0] || 'unknown';
  }

  private extractEntityId(url: string): string | null {
    // Simple heuristic: check if safe last part is a number or uuid
    // This is basic, might need improvement
    const parts = url.split('/');
    const last = parts[parts.length - 1];
    if (last && /^\d+$/.test(last)) return last;
    return null;
  }

  private async logAuditEvent(data: {
    userId?: number;
    organizationId?: number;
    branchId?: number;
    action: string;
    entityName: string;
    entityId?: string;
    metadata: any;
  }) {
    try {
      await this.prisma.auditLog.create({
        data: {
          userId: data.userId,
          organizationId: data.organizationId,
          branchId: data.branchId,
          action: data.action,
          entityName: data.entityName,
          entityId: data.entityId,
          metadata: data.metadata,
        }
      });
    } catch (e) {
      console.error('Audit Log Error:', e);
    }
  }
}

