import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class CreateInventoryItemDto {
  @ApiProperty({ description: 'Branch where the stock will be created' })
  @IsOptional()
  @IsInt()
  branchId?: number;

  @ApiProperty({ description: 'Product name' })
  @IsString()
  name: string;

  @ApiProperty({ description: 'Brand', required: false })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiProperty({ description: 'Model', required: false })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiProperty({ description: 'SKU code', required: false })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiProperty({ description: 'Unit price', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({ description: 'Initial stock quantity', default: 0 })
  @IsInt()
  @Min(0)
  qty: number;

  @ApiProperty({ description: 'Minimum stock threshold', default: 0 })
  @IsInt()
  @Min(0)
  min: number;

  @ApiProperty({ description: 'Maximum stock threshold', required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  max?: number;
}


