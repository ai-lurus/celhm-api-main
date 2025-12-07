import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

export class CreateCashCutDto {
  @ApiProperty()
  @IsInt()
  cashRegisterId: number;

  @ApiProperty()
  @IsInt()
  branchId: number;

  @ApiProperty({ description: 'Date of the cash cut (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({ description: 'Initial amount (if not provided, uses last cut final amount)' })
  @IsOptional()
  @IsNumber()
  initialAmount?: number;

  @ApiPropertyOptional({ description: 'Adjustments (withdrawals, etc.)' })
  @IsOptional()
  @IsNumber()
  adjustments?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

