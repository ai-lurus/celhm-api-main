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

  async updateOrganization(user: AuthUser, data: {
    name?: string;
    logo?: string;
    address?: string;
    phone?: string;
    email?: string;
    taxId?: string;
    website?: string;
    currency?: string;
    timezone?: string;
  }) {
    // For now, only update name as other fields don't exist in schema yet
    // TODO: Add migration to add these fields to Organization model
    const updateData: any = {};
    if (data.name) {
      updateData.name = data.name;
    }
    
    return this.prisma.organization.update({
      where: { id: user.organizationId },
      data: updateData,
    });
  }
}

