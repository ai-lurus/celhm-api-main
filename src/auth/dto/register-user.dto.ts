import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@prisma/client';

export class RegisterUserDto {
    @ApiProperty({ example: 'user@example.com' })
    @IsEmail()
    @IsNotEmpty()
    email: string;

    @ApiProperty({ example: 'John Doe' })
    @IsString()
    @IsNotEmpty()
    name: string;

    @ApiProperty({ example: 1 })
    @IsInt()
    @IsNotEmpty()
    organizationId: number;

    @ApiProperty({ enum: Role, example: Role.LABORATORIO })
    @IsEnum(Role)
    @IsNotEmpty()
    role: Role;

    @ApiProperty({ example: 1, required: false })
    @IsInt()
    @IsOptional()
    branchId?: number;
}
