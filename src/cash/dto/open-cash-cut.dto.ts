import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsNumber, IsDateString } from 'class-validator';

export class OpenCashCutDto {
  @ApiProperty()
  @IsInt()
  cashRegisterId: number;

  @ApiProperty()
  @IsInt()
  branchId: number;

  @ApiProperty({ description: 'Date of the opening (YYYY-MM-DD)' })
  @IsDateString()
  date: string;

  @ApiProperty({ description: 'Initial amount' })
  @IsNumber()
  initialAmount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
