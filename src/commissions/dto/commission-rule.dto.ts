import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { CommissionBasis, CommissionCalcMethod, CommissionScope } from '@prisma/client';

export class CreateCommissionRuleDto {
  @ApiProperty({ enum: CommissionBasis })
  @IsEnum(CommissionBasis)
  basis: CommissionBasis;

  @ApiProperty({ enum: CommissionScope })
  @IsEnum(CommissionScope)
  scopeType: CommissionScope;

  @ApiPropertyOptional({
    description:
      'Categoría de producto (texto libre, cuando scopeType=PRODUCT_CATEGORY) o id de CustomerGroup como string (cuando scopeType=CUSTOMER_GROUP). Ignorado cuando scopeType=GENERAL.',
  })
  @IsOptional()
  @IsString()
  scopeValue?: string;

  @ApiProperty({ enum: CommissionCalcMethod })
  @IsEnum(CommissionCalcMethod)
  calcMethod: CommissionCalcMethod;

  @ApiProperty({ description: 'Porcentaje (0-100) si calcMethod=PERCENTAGE, o monto fijo si calcMethod=FIXED' })
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional({ description: 'ISO date; default: ahora' })
  @IsOptional()
  @IsDateString()
  validFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;
}

export class CreateCommissionRuleOverrideDto extends CreateCommissionRuleDto {
  @ApiProperty()
  @IsInt()
  membershipId: number;
}

export class ReviseCommissionRuleDto {
  @ApiProperty({ enum: CommissionCalcMethod })
  @IsEnum(CommissionCalcMethod)
  calcMethod: CommissionCalcMethod;

  @ApiProperty()
  @IsNumber()
  @Min(0)
  value: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  label?: string;
}
