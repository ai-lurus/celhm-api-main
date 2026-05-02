import { Injectable, UnauthorizedException, ConflictException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../common/prisma/prisma.service';
import { Role } from '@prisma/client';
import { RegisterUserDto } from './dto/register-user.dto';
import { LoginDto } from './dto/login.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ConfigService } from '@nestjs/config';
import { EmailProvider } from '../notifications/providers/email.provider';
import * as bcrypt from 'bcryptjs';

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  organizationId: number;
  branchId?: number;
  role: Role;
}

export interface JwtPayload {
  sub: number;
  email: string;
  organizationId: number;
  role: Role;
  branchId?: number;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    private emailProvider: EmailProvider,
    private jwtService: JwtService,
  ) {}

  async login(dto: LoginDto): Promise<{ access_token: string; user: AuthUser; expires_in: string }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: {
        memberships: { where: { status: 'ACTIVO' }, take: 1, include: { organization: true } },
        branch: true,
      },
    });

    if (!user || !user.password || user.status === 'INACTIVO') {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.password);
    if (!passwordValid) {
      throw new UnauthorizedException('Credenciales inválidas');
    }

    if (!user.memberships.length) {
      throw new UnauthorizedException('Usuario sin organización asignada');
    }

    const membership = user.memberships[0];
    const expiresIn = this.configService.get<string>('JWT_EXPIRY') || '7d';

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email || '',
      organizationId: membership.organizationId,
      role: membership.role,
      branchId: user.branchId || undefined,
    };

    const authUser: AuthUser = {
      id: user.id,
      email: user.email || '',
      name: user.name || '',
      role: membership.role,
      organizationId: membership.organizationId,
      branchId: user.branchId || undefined,
    };

    return {
      access_token: this.jwtService.sign(payload),
      user: authUser,
      expires_in: expiresIn,
    };
  }

  async validateJwtPayload(payload: JwtPayload): Promise<AuthUser | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: {
          memberships: {
            where: { organizationId: payload.organizationId, status: 'ACTIVO' },
            include: { organization: true },
          },
          branch: true,
        },
      });

      if (!user || user.status === 'INACTIVO' || !user.memberships.length) {
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
    } catch {
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
    } catch {
      return null;
    }
  }

  async changePassword(userId: number, dto: ChangePasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user || !user.password) {
      throw new UnauthorizedException('Usuario no encontrado');
    }

    const currentValid = await bcrypt.compare(dto.currentPassword, user.password);
    if (!currentValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    const hashed = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({
      where: { id: userId },
      data: { password: hashed },
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: { memberships: { where: { status: 'ACTIVO' }, take: 1 } },
    });

    if (!user || user.status === 'INACTIVO' || !user.memberships.length) {
      return;
    }

    const tempPassword =
      Math.random().toString(36).slice(-8) +
      Math.random().toString(36).slice(-8).toUpperCase() +
      '!';
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    const appUrl = this.configService.get<string>('APP_URL');
    await this.emailProvider.send(
      email,
      'Recuperación de contraseña - CelHM',
      `<p>Hola <strong>${user.name}</strong>,</p>
       <p>Recibimos una solicitud para restablecer tu contraseña. Usa la siguiente contraseña temporal para ingresar:</p>
       <p><strong>Contraseña temporal:</strong> ${tempPassword}</p>
       <p><a href="${appUrl}">Ingresar a CelHM</a></p>
       <p>Te recomendamos cambiar tu contraseña después de ingresar.</p>
       <p>Si no solicitaste este cambio, ignora este correo.</p>`,
    );
  }

  async registerUser(dto: RegisterUserDto): Promise<AuthUser & { tempPassword: string }> {
    const { email, name, organizationId, role, branchId } = dto;

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) {
      throw new ConflictException('Ya existe un usuario con ese correo');
    }

    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase() + '!';
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const newUser = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
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
    ).catch((err: Error) => {
      console.error('Failed to send credentials email:', err.message);
    });

    return {
      id: newUser.id,
      email: newUser.email || '',
      name: newUser.name || '',
      role: newUser.memberships[0].role,
      organizationId: newUser.memberships[0].organizationId,
      branchId: newUser.branchId || undefined,
      tempPassword,
    };
  }
}
