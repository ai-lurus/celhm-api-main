import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsNumber } from 'class-validator';

export class UpdateCashCutDto {
  @ApiPropertyOptional({ description: 'Declared cash amount counted by the user' })
  @IsOptional()
  @IsNumber()
  declaredAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Breakdown of cash denominations' })
  @IsOptional()
  denominations?: Record<string, number>;
}
