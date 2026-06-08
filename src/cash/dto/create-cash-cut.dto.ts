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

  @ApiProperty({ description: 'Declared cash amount counted by the user' })
  @IsNumber()
  declaredAmount: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ description: 'Breakdown of cash denominations' })
  @IsOptional()
  denominations?: Record<string, number>;
}
