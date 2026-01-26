import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role } from '@prisma/client';
import { compare } from 'bcryptjs';

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
    private jwtService: JwtService,
  ) { }

  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    try {
      // Log for debugging
      console.log('🔐 Validating user:', email);

      // Log DATABASE_URL status (without password) for debugging
      const dbUrl = process.env.DATABASE_URL;
      if (dbUrl) {
        try {
          const url = new URL(dbUrl);
          console.log('🔌 [AUTH] DB Connection info:', {
            host: url.hostname,
            port: url.port || '5432',
            user: url.username,
            database: url.pathname.replace('/', ''),
            ssl: url.searchParams.get('sslmode') || 'not set',
            vercel: !!process.env.VERCEL
          });
        } catch (e) {
          console.log('⚠️ [AUTH] Could not parse DATABASE_URL');
        }
      } else {
        console.error('❌ [AUTH] DATABASE_URL is not set!');
      }

      // Find user by email
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: {
          memberships: {
            include: { organization: true },
          },
          branch: true,
        },
      });

      if (!user) {
        console.log('❌ User not found:', email);
        return null;
      }

      console.log('👤 User found:', {
        id: user.id,
        email: user.email,
        hasPassword: !!user.password,
        membershipsCount: user.memberships.length,
        passwordHash: user.password ? `${user.password.substring(0, 20)}...` : 'null',
        passwordHashFull: user.password || 'null', // Log full hash for debugging
        memberships: user.memberships.map(m => ({
          organizationId: m.organizationId,
          role: m.role
        }))
      });

      // If user has password, validate it
      if (user.password) {
        try {
          const isPasswordValid = await compare(password, user.password);
          console.log('🔑 Password validation result:', isPasswordValid);
          console.log('🔑 Password provided length:', password.length);
          console.log('🔑 Password hash length:', user.password.length);
          if (!isPasswordValid) {
            console.log('❌ Invalid password for user:', email);
            return null;
          }
          console.log('✅ Password valid for user:', email);
        } catch (error: any) {
          console.error('❌ Error comparing password:', error.message);
          return null;
        }
      } else {
        // If no password set, user might be using Supabase Auth
        // For now, reject if no password
        console.log('❌ User has no password set:', email);
        return null;
      }

      // Get first membership (or use default organization)
      const membership = user.memberships[0];
      if (!membership) {
        console.log('❌ User has no memberships:', email);
        return null;
      }

      console.log('✅ User validated successfully:', {
        email,
        role: membership.role,
        organizationId: membership.organizationId
      });

      return {
        id: user.id,
        email: user.email || '',
        name: user.name || '',
        role: membership.role,
        organizationId: membership.organizationId,
        branchId: user.branchId || undefined,
      };
    } catch (error: any) {
      console.error('❌ Error in validateUser:', error);
      console.error('   Message:', error.message);
      console.error('   Code:', error.code);
      if (error.meta) {
        console.error('   Meta:', JSON.stringify(error.meta, null, 2));
      }
      // Re-throw to be caught by controller
      throw error;
    }
  }

  async login(user: AuthUser) {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      branchId: user.branchId,
    };

    const access_token = this.jwtService.sign(payload);

    // Log for debugging (remove in production)
    if (process.env.NODE_ENV !== 'production') {
      console.log('🔑 Generated JWT token for user:', user.email);
    }

    return {
      access_token,
      user,
    };
  }

  async validateJwtPayload(payload: any): Promise<AuthUser | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          memberships: {
            where: { organizationId: payload.organizationId },
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

  async validateSupabaseUser(payload: any): Promise<AuthUser | null> {
    const supabaseId = payload.sub;
    const email = payload.email;

    if (!supabaseId || !email) {
      return null;
    }

    try {
      // 1. Try to find user by authUserId (Supabase ID)
      let user = await this.prisma.user.findUnique({
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
      if (!user) {
        // Find by email to link account
        const existingUser = await this.prisma.user.findUnique({
          where: { email },
        });

        if (existingUser) {
          // Update authUserId
          user = await this.prisma.user.update({
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

      if (!user.memberships.length) {
        console.log(`❌ User ${email} has no memberships`);
        return null; // Must belong to an organization
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

