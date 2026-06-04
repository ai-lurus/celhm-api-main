import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, IsNumber, Min, ValidateIf, IsBoolean } from 'class-validator';

export class CreateInventoryItemDto {
  @ApiProperty({ description: 'Branch where the stock will be created' })
  @IsOptional()
  @IsInt()
  branchId?: number;

  @ApiProperty({ description: 'Product ID (if creating stock for an existing catalog product)', required: false })
  @IsOptional()
  @IsInt()
  productId?: number;

  @ApiProperty({ description: 'Product name' })
  @ValidateIf((o) => !o.productId)
  @IsString()
  name?: string;

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

  @ApiProperty({ description: 'Unit sale price', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price?: number;

  @ApiProperty({ description: 'Unit purchase price', required: false })
  @IsOptional()
  @IsNumber()
  @Min(0)
  purchasePrice?: number;

  @ApiProperty({ description: 'Barcode', required: false })
  @IsOptional()
  @IsString()
  barcode?: string;


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

  @ApiProperty({ description: 'Indicates if price is editable at POS', required: false })
  @IsOptional()
  @IsBoolean()
  isPriceEditable?: boolean;

  @ApiProperty({ description: 'Indicates if the product tracks inventory', required: false })
  @IsOptional()
  @IsBoolean()
  tracksInventory?: boolean;
}


