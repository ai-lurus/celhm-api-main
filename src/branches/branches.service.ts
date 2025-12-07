import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async getBranches(organizationId: number) {
    return this.prisma.branch.findMany({
      where: { 
        organizationId,
        active: true 
      },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: {
            users: true,
            stocks: true,
            tickets: true,
          },
        },
      },
    });
  }

  async getBranchById(branchId: number, organizationId: number) {
    return this.prisma.branch.findFirst({
      where: { 
        id: branchId,
        organizationId 
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
          },
        },
        _count: {
          select: {
            stocks: true,
            tickets: true,
            movements: true,
          },
        },
      },
    });
  }
}

