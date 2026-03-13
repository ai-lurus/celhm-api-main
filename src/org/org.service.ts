import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { AuthUser } from '../auth/auth.service';
import { UpdateOrgDto } from './dto/update-org.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

@Injectable()
export class OrgService {
  constructor(private prisma: PrismaService) { }

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

  async updateOrganization(user: AuthUser, data: UpdateOrgDto) {
    return this.prisma.organization.update({
      where: { id: user.organizationId },
      data,
    });
  }

  async updateMember(user: AuthUser, memberId: number, data: UpdateMemberDto) {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { id: memberId },
    });

    if (!membership) throw new NotFoundException('Member not found');
    if (membership.organizationId !== user.organizationId) {
      throw new ForbiddenException('Member does not belong to your organization');
    }

    await this.prisma.$transaction(async (tx) => {
      if (data.role !== undefined) {
        await tx.orgMembership.update({ where: { id: memberId }, data: { role: data.role } });
      }
      if ('branchId' in data) {
        await tx.user.update({ where: { id: membership.userId }, data: { branchId: data.branchId ?? null } });
      }
    });

    return this.prisma.orgMembership.findUnique({
      where: { id: memberId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            branch: { select: { id: true, name: true, code: true } },
          },
        },
      },
    });
  }

  async deleteMember(user: AuthUser, memberId: number) {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { id: memberId },
    });

    if (!membership) throw new NotFoundException('Member not found');
    if (membership.organizationId !== user.organizationId) {
      throw new ForbiddenException('Member does not belong to your organization');
    }

    await this.prisma.orgMembership.delete({ where: { id: memberId } });
    return { message: 'Member removed successfully' };
  }
}

