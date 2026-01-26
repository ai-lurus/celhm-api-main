import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role } from '@prisma/client';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  organizationId: number;
  branchId?: number;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
  ) { }


  async validateSupabaseUser(user: any): Promise<AuthUser | null> {
    const supabaseId = user.id;
    const email = user.email;

    if (!supabaseId || !email) {
      return null;
    }

    try {
      // 1. Try to find user by authUserId (Supabase ID)
      let dbUser = await this.prisma.user.findUnique({
        where: { authUserId: supabaseId },
        include: {
          memberships: {
            // We take the first membership if not specified in payload
            // ideally we'd want organizationId in metadata, but for now take first
            take: 1,
            include: { organization: true }
          },
          branch: true,
        },
      });

      // 2. If not found, try to link by email
      if (!dbUser) {
        // Find by email to link account
        const existingUser = await this.prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          // Update authUserId
          dbUser = await this.prisma.user.update({
            where: { id: existingUser.id },
            data: { authUserId: supabaseId },
            include: {
              memberships: { take: 1, include: { organization: true } },
              branch: true,
            },
          });
          console.log(`🔗 Linked Supabase ID ${supabaseId} to user ${email}`);
        } else {
          // User doesn't exist in our system. 
          // Depending on requirements, we could return null or create a user.
          // For this internal system, we return null (Unauthorized).
          console.log(`❌ User not found for Supabase ID ${supabaseId} or email ${email}`);
          return null;
        }
      }

      if (!dbUser.memberships.length) {
        console.log(`❌ User ${email} has no memberships`);
        return null; // Must belong to an organization
      }

      const membership = dbUser.memberships[0];

      return {
        id: dbUser.id,
        email: dbUser.email || '',
        name: dbUser.name || '',
        role: membership.role,
        organizationId: membership.organizationId,
        branchId: dbUser.branchId || undefined,
      };
    } catch (error) {
      console.error('Error validating supabase user:', error);
      return null;
    }
  }

  async getCurrentUser(userId: number, organizationId: number): Promise<AuthUser | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        include: {
          memberships: {
            where: { organizationId },
            include: { organization: true },
          },
          branch: true,
        },
      });

      if (!user || !user.memberships.length) {
        return null;
      }

      const membership = user.memberships[0];

      return {
        id: user.id,
        email: user.email || '',
        name: user.name || '',
        role: membership.role,
        organizationId: membership.organizationId,
        branchId: user.branchId || undefined,
      };
    } catch (error) {
      return null;
    }
  }
}

