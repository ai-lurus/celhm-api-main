import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsInt, IsEmail, IsBoolean } from 'class-validator';

export class CreateCustomerDto {
  @ApiProperty()
  @IsString()
  name: string;

  @ApiProperty({ description: 'Phone number (required)' })
  @IsString()
  phone: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  branchId?: number;

  @ApiPropertyOptional({ description: 'For future use (Fase 2)' })
  @IsOptional()
  @IsBoolean()
  isWholesale?: boolean;

  @ApiPropertyOptional({ description: 'For future use (Fase 2)' })
  @IsOptional()
  @IsBoolean()
  isCorporate?: boolean;
}

