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
  ) {}

  async validateUser(email: string, password: string): Promise<AuthUser | null> {
    // Log for debugging (temporary - enable in production for troubleshooting)
    console.log('🔐 Validating user:', email);
    console.log('🔐 Password received length:', password.length);
    console.log('🔐 Password received (first 10 chars):', password.substring(0, 10));
    console.log('🔐 Password received (last 10 chars):', password.substring(Math.max(0, password.length - 10)));

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

