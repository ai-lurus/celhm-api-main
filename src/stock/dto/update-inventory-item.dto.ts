import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsNumber, Min } from 'class-validator';

export class UpdateInventoryItemDto {
  @ApiPropertyOptional({ description: 'Product name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Brand' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Model' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'SKU code' })
  @IsOptional()
  @IsString()
  sku?: string;

  @ApiPropertyOptional({ description: 'Unit sale price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiPropertyOptional({ description: 'Unit purchase/cost price' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @ApiPropertyOptional({ description: 'Current stock quantity (alias: initial_stock)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  qty?: number;

  /** Alias used by frontend – maps to qty */
  @ApiPropertyOptional({ description: 'Stock quantity (frontend alias for qty)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  initial_stock?: number;

  @ApiPropertyOptional({ description: 'Minimum stock threshold' })
  @IsOptional()
  @IsInt()
  @Min(0)
  min?: number;

  /** Alias used by frontend – maps to min */
  @ApiPropertyOptional({ description: 'Min stock (frontend alias for min)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  min_stock?: number;

  @ApiPropertyOptional({ description: 'Maximum stock threshold' })
  @IsOptional()
  @IsInt()
  @Min(0)
  max?: number;

  /** Alias used by frontend – maps to max */
  @ApiPropertyOptional({ description: 'Max stock (frontend alias for max)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  max_stock?: number;
}
