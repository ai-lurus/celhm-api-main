import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';

@Injectable()
export class FoliosService {
  constructor(private prisma: PrismaService) {}

  async next(prefix: string, branchId: number): Promise<string> {
    const currentPeriod = new Date().toISOString().slice(0, 7).replace('-', ''); // YYYYMM

    return this.prisma.$transaction(async (tx) => {
      // Get branch info for code
      const branch = await tx.branch.findUnique({
        where: { id: branchId },
        select: { code: true },
      });

      if (!branch) {
        throw new Error('Branch not found');
      }

      // Find or create folio sequence
      const folioSeq = await tx.folioSequence.findUnique({
        where: {
          prefix_branchId_period: {
            prefix,
            branchId,
            period: currentPeriod,
          },
        },
      });

      let newSeq: number;
      if (folioSeq) {
        newSeq = folioSeq.seq + 1;
        await tx.folioSequence.update({
          where: { id: folioSeq.id },
          data: { seq: newSeq },
        });
      } else {
        newSeq = 1;
        await tx.folioSequence.create({
          data: {
            prefix,
            branchId,
            period: currentPeriod,
            seq: newSeq,
          },
        });
      }

      return `${prefix}-${branch.code}-${currentPeriod}-${newSeq.toString().padStart(4, '0')}`;
    });
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

