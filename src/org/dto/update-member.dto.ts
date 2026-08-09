import { IsEnum, IsOptional, IsInt, IsNumber, Min, Max } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Type } from 'class-transformer';

export class UpdateMemberDto {
  @ApiPropertyOptional({ enum: Role })
  @IsEnum(Role)
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional()
  @IsInt()
  @IsOptional()
  branchId?: number | null;

  @ApiPropertyOptional({ description: 'Commission rate percentage (0-100)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  commissionRate?: number | null;

  @ApiPropertyOptional({ description: 'Commission plan template id to assign to this member' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  commissionPlanId?: number | null;
}
