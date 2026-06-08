// @ts-nocheck
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean } from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Product name' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'Product description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Product category' })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Product brand' })
  @IsOptional()
  @IsString()
  brand?: string;

  @ApiPropertyOptional({ description: 'Product model' })
  @IsOptional()
  @IsString()
  model?: string;

  @ApiPropertyOptional({ description: 'Indicates if price is editable at POS' })
  @IsOptional()
  @IsBoolean()
  isPriceEditable?: boolean;

  @ApiPropertyOptional({ description: 'Indicates if the product tracks inventory' })
  @IsOptional()
  @IsBoolean()
  tracksInventory?: boolean;

  @ApiPropertyOptional({ description: 'Indicates if the product generates sales commissions' })
  @IsOptional()
  @IsBoolean()
  isCommissionable?: boolean;
}

