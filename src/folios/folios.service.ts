import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class FoliosService {
  constructor(private prisma: PrismaService) {}

  async next(prefix: string, branchId: number): Promise<string> {
    const currentPeriod = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM

    // PgBouncer transaction mode doesn't support interactive transactions
    // Using optimistic locking with retry logic instead
    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        // Get branch info for code
        const branch = await this.prisma.branch.findUnique({
          where: { id: branchId },
          select: { code: true },
        });

        if (!branch) {
          throw new Error('Branch not found');
        }

        // Find or create folio sequence using upsert (atomic operation)
        const folioSeq = await this.prisma.folioSequence.upsert({
          where: {
            prefix_branchId_period: {
              prefix,
              branchId,
              period: currentPeriod,
            },
          },
          update: {
            seq: {
              increment: 1,
            },
          },
          create: {
            prefix,
            branchId,
            period: currentPeriod,
            seq: 1,
          },
        });

        const newSeq = folioSeq.seq;
        return `${prefix}-${branch.code}-${currentPeriod}-${newSeq.toString().padStart(4, '0')}`;
      } catch (error: any) {
        // Retry on unique constraint violation or concurrent update
        if (error.code === 'P2002' || error.code === 'P2034') {
          retries++;
          if (retries >= maxRetries) {
            throw new Error('Failed to generate folio after retries');
          }
          // Small delay before retry
          await new Promise(resolve => setTimeout(resolve, 10 * retries));
          continue;
        }
        throw error;
      }
    }

    throw new Error('Failed to generate folio');
  }

  async preview(prefix: string, branchId: number): Promise<string> {
    const currentPeriod = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM

    const branch = await this.prisma.branch.findUnique({
      where: { id: branchId },
      select: { code: true },
    });

    if (!branch) {
      throw new Error('Branch not found');
    }

    const folioSeq = await this.prisma.folioSequence.findUnique({
      where: {
        prefix_branchId_period: {
          prefix,
          branchId,
          period: currentPeriod,
        },
      },
    });

    const nextSeq = folioSeq ? folioSeq.seq + 1 : 1;
    return `${prefix}-${branch.code}-${currentPeriod}-${nextSeq.toString().padStart(4, '0')}`;
  }
}

