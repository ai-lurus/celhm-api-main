import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role } from '@prisma/client';
import { RegisterUserDto } from './dto/register-user.dto';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EmailProvider } from '../notifications/providers/email.provider';

export interface AuthUser {
  id: number;
  authUserId: string;
  email: string;
  name: string;
  organizationId: number;
  branchId?: number;
  role: Role;
}

@Injectable()
export class AuthService {
  private supabaseAdmin: SupabaseClient;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private emailProvider: EmailProvider,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseServiceKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (supabaseUrl && supabaseServiceKey) {
      this.supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      });
    }
  }


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
        authUserId: supabaseId,
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
        authUserId: user.authUserId || '',
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


  async changePassword(authUserId: string, newPassword: string): Promise<void> {
    if (!this.supabaseAdmin) {
      throw new Error('Supabase Admin client not initialized.');
    }

    const { error } = await this.supabaseAdmin.auth.admin.updateUserById(authUserId, {
      password: newPassword,
    });

    if (error) {
      throw new Error(`Failed to change password: ${error.message}`);
    }
  }

  async registerUser(dto: RegisterUserDto): Promise<AuthUser> {
    if (!this.supabaseAdmin) {
      throw new Error('Supabase Admin client not initialized. Check SUPABASE_SERVICE_ROLE_KEY.');
    }

    const { email, name, organizationId, role, branchId } = dto;

    // 1. Generate temporary password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase() + '!';

    // 2. Create user in Supabase with confirmed email and temp password
    const { data, error } = await this.supabaseAdmin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
    });

    if (error) {
      if (error.message?.toLowerCase().includes('already been registered') || error.message?.toLowerCase().includes('already registered')) {
        throw new ConflictException('Ya existe un usuario con ese correo');
      }
      throw new Error(`Failed to create user: ${error.message}`);
    }

    const supabaseUser = data.user;

    if (!supabaseUser) {
      throw new Error('Supabase user creation failed unexpectedly.');
    }

    // 3. Create user in local DB
    let newUser: any;
    try {
      newUser = await this.prisma.user.create({
        data: {
          email: supabaseUser.email,
          authUserId: supabaseUser.id,
          name,
          defaultOrganization: { connect: { id: organizationId } },
          branch: branchId ? { connect: { id: branchId } } : undefined,
          memberships: {
            create: { organizationId, role },
          },
        },
        include: {
          memberships: { include: { organization: true } },
        },
      });
    } catch (dbError: any) {
      const { error: rollbackError } = await this.supabaseAdmin.auth.admin.deleteUser(supabaseUser.id);
      if (rollbackError) {
        console.error('Rollback failed — Supabase user orphaned:', supabaseUser.id, rollbackError.message);
      }
      throw new Error(`Failed to create local user record: ${dbError.message}`);
    }

    // 4. Send credentials email (non-blocking — user is created regardless)
    const appUrl = this.configService.get<string>('APP_URL');
    this.emailProvider.send(
      email,
      'Tu acceso a CelHM',
      `<p>Hola <strong>${name}</strong>,</p>
       <p>Tu cuenta ha sido creada. Usa las siguientes credenciales para ingresar:</p>
       <p><strong>Correo:</strong> ${email}<br/>
       <strong>Contraseña temporal:</strong> ${tempPassword}</p>
       <p><a href="${appUrl}">Ingresar a CelHM</a></p>
       <p>Te recomendamos cambiar tu contraseña después de tu primer inicio de sesión.</p>`,
    ).catch((err) => {
      console.error('Failed to send credentials email:', err.message);
    });

    return {
      id: newUser.id,
      authUserId: supabaseUser.id,
      email: newUser.email || '',
      name: newUser.name || '',
      role: newUser.memberships[0].role,
      organizationId: newUser.memberships[0].organizationId,
      branchId: newUser.branchId || undefined,
    };
  }
}

