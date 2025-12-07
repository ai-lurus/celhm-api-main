import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService) {}

  async getCurrentOrganization(user: AuthUser) {
    return this.prisma.organization.findUnique({
      where: { id: user.organizationId },
      include: {
        branches: {
          where: { active: true },
          orderBy: { name: 'asc' },
        },
        _count: {
          select: {
            users: true,
            branches: true,
          },
        },
      },
    });
  }

  async getOrganizationMembers(organizationId: number) {
    return this.prisma.orgMembership.findMany({
      where: { organizationId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            branch: {
              select: {
                id: true,
                name: true,
                code: true,
              },
            },
          },
        },
      },
      orderBy: { user: { name: 'asc' } },
    });
  }
}

