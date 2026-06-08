import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsEnum, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';

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

    @ApiPropertyOptional({ description: 'Commission rate percentage (0-100)' })
    @IsOptional()
    @Type(() => Number)
    @IsNumber()
    @Min(0)
    @Max(100)
    commissionRate?: number;
}
