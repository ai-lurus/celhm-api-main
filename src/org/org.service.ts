import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { SupabaseService } from '../common/supabase/supabase.service';
import { AuthUser } from '../auth/auth.service';
import { UpdateOrgDto } from './dto/update-org.dto';
import { UpdateMemberDto } from './dto/update-member.dto';

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
    console.log('[deleteMember] Called with memberId:', memberId, 'by user:', user.id);

    const membership = await this.prisma.orgMembership.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    console.log('[deleteMember] Membership found:', membership ? `id=${membership.id}, userId=${membership.userId}` : 'null');

    if (!membership) throw new NotFoundException('Member not found');
    if (membership.organizationId !== user.organizationId) {
      throw new ForbiddenException('Member does not belong to your organization');
    }

    const targetUser = membership.user;
    console.log('[deleteMember] Target user:', { id: targetUser.id, email: targetUser.email, authUserId: targetUser.authUserId });

    try {
      // Delete membership and user record from the database in a transaction
      await this.prisma.$transaction(async (tx) => {
        // Remove membership
        console.log('[deleteMember] Deleting orgMembership:', memberId);
        await tx.orgMembership.delete({ where: { id: memberId } });

        // Nullify foreign keys referencing this user (all are optional)
        console.log('[deleteMember] Nullifying foreign keys for userId:', targetUser.id);
        await tx.ticket.updateMany({ where: { userId: targetUser.id }, data: { userId: null } });
        await tx.ticketHistory.updateMany({ where: { userId: targetUser.id }, data: { userId: null } });
        await tx.sale.updateMany({ where: { userId: targetUser.id }, data: { userId: null } });
        await tx.payment.updateMany({ where: { userId: targetUser.id }, data: { userId: null } });
        await tx.movement.updateMany({ where: { userId: targetUser.id }, data: { userId: null } });
        await tx.cashCut.updateMany({ where: { userId: targetUser.id }, data: { userId: null } });

        // Now delete the user
        console.log('[deleteMember] Deleting user from DB:', targetUser.id);
        await tx.user.delete({ where: { id: targetUser.id } });
        console.log('[deleteMember] User deleted from DB successfully');
      });
    } catch (error) {
      console.error('[deleteMember] Transaction FAILED:', error);
      throw error;
    }

    // Delete the user from Supabase Auth (if they have an auth account)
    if (targetUser.authUserId) {
      console.log('[deleteMember] Deleting from Supabase Auth:', targetUser.authUserId);
      const deleted = await this.supabase.deleteAuthUser(targetUser.authUserId);
      console.log('[deleteMember] Supabase Auth delete result:', deleted);
      if (!deleted) {
        this.logger.warn(
          `User ${targetUser.id} removed from DB but failed to delete from Supabase Auth (authUserId: ${targetUser.authUserId})`,
        );
      }
    } else {
      console.log('[deleteMember] No authUserId – skipping Supabase Auth delete');
    }

    console.log('[deleteMember] Done');
    return { message: 'Member removed successfully' };
  }
}

