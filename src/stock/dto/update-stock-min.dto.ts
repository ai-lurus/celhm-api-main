import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class UpdateStockMinDto {
  @ApiProperty()
  @IsInt()
  branchId: number;

  @ApiProperty()
  @IsInt()
  variantId: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  min: number;
}

