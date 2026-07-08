import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { AuthUser } from '../auth/auth.service';
import { UpdateOrgDto } from './dto/update-org.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { UpdateMemberPasswordDto } from './dto/update-member-password.dto';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class OrgService {
  private readonly logger = new Logger(OrgService.name);

  constructor(
    private prisma: PrismaService,
    private supabase: SupabaseService,
  ) { }

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
      where: { organizationId, status: 'ACTIVO' },
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
      data: {
        ...data,
        ...(data.ticketLegends && {
          ticketLegends: data.ticketLegends.map((legend) => ({ ...legend })),
        }),
      },
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
      const membershipUpdate: any = {};
      if (data.role !== undefined) {
        membershipUpdate.role = data.role;
      }
      if ('commissionRate' in data) {
        membershipUpdate.commissionRate = data.commissionRate ?? null;
      }
      if (Object.keys(membershipUpdate).length > 0) {
        await tx.orgMembership.update({ where: { id: memberId }, data: membershipUpdate });
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
      include: {
        user: {
          include: {
            memberships: { where: { status: 'ACTIVO', id: { not: memberId } } },
          },
        },
      },
    });

    if (!membership) throw new NotFoundException('Member not found');
    if (membership.organizationId !== user.organizationId) {
      throw new ForbiddenException('Member does not belong to your organization');
    }

    const targetUser = membership.user;
    const hasOtherActiveMemberships = targetUser.memberships.length > 0;

    await this.prisma.$transaction(async (tx) => {
      await tx.orgMembership.update({ where: { id: memberId }, data: { status: 'INACTIVO' } });

      if (!hasOtherActiveMemberships) {
        const deletedEmail = targetUser.email ? `${targetUser.email}.deleted.${Date.now()}` : null;
        await tx.user.update({ 
          where: { id: targetUser.id }, 
          data: { 
            status: 'INACTIVO',
            ...(deletedEmail && { email: deletedEmail }),
          } 
        });
      }
    });

    if (!hasOtherActiveMemberships && targetUser.authUserId) {
      const deleted = await this.supabase.deleteAuthUser(targetUser.authUserId);
      if (!deleted) {
        this.logger.warn(
          `User ${targetUser.id} marked inactive but failed to delete from Supabase Auth (authUserId: ${targetUser.authUserId})`,
        );
      }
    }

    return { message: 'Member removed successfully' };
  }

  async updateMemberPassword(user: AuthUser, memberId: number, data: UpdateMemberPasswordDto) {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { id: memberId },
    });

    if (!membership) throw new NotFoundException('Member not found');
    if (membership.organizationId !== user.organizationId) {
      throw new ForbiddenException('Member does not belong to your organization');
    }

    const hashed = await bcrypt.hash(data.newPassword, 10);
    await this.prisma.user.update({
      where: { id: membership.userId },
      data: { password: hashed },
    });

    return { message: 'Password updated successfully' };
  }
}

